import { IFileSystem } from "../services/vfs/index.js";
import { logger } from "./logger.js";

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

interface FilePatch {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
}

/**
 * Parses a standard unified diff / git patch string into structured file patches.
 */
export function parsePatch(patchContent: string): FilePatch[] {
  const filePatches: FilePatch[] = [];
  const lines = patchContent.split(/\r?\n/);
  
  let currentFilePatch: FilePatch | null = null;
  let currentHunk: Hunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      // New file boundary
      if (currentFilePatch) {
        filePatches.push(currentFilePatch);
      }
      currentFilePatch = { oldFile: "", newFile: "", hunks: [] };
      currentHunk = null;
      continue;
    }

    if (line.startsWith("--- ")) {
      if (!currentFilePatch) {
        currentFilePatch = { oldFile: "", newFile: "", hunks: [] };
      }
      // e.g., "--- a/src/server/agents/tools/index.ts" -> strip a/
      let oldPath = line.substring(4).trim();
      if (oldPath.startsWith("a/")) {
        oldPath = oldPath.substring(2);
      }
      currentFilePatch.oldFile = oldPath;
      continue;
    }

    if (line.startsWith("+++ ")) {
      if (!currentFilePatch) {
        currentFilePatch = { oldFile: "", newFile: "", hunks: [] };
      }
      let newPath = line.substring(4).trim();
      if (newPath.startsWith("b/")) {
        newPath = newPath.substring(2);
      }
      currentFilePatch.newFile = newPath;
      continue;
    }

    const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
    if (hunkHeaderMatch && currentFilePatch) {
      if (currentHunk) {
        currentFilePatch.hunks.push(currentHunk);
      }
      const oldStart = parseInt(hunkHeaderMatch[1], 10);
      const oldCount = hunkHeaderMatch[2] ? parseInt(hunkHeaderMatch[2], 10) : 1;
      const newStart = parseInt(hunkHeaderMatch[3], 10);
      const newCount = hunkHeaderMatch[4] ? parseInt(hunkHeaderMatch[4], 10) : 1;

      currentHunk = {
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: []
      };
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line === "") {
        currentHunk.lines.push(line);
      } else if (line.startsWith("\\ No newline at end of file")) {
        // Skip
      } else {
        // Not a hunk line, finalize current hunk
        if (currentFilePatch) currentFilePatch.hunks.push(currentHunk);
        currentHunk = null;
      }
    }
  }

  if (currentFilePatch) {
    if (currentHunk) {
      currentFilePatch.hunks.push(currentHunk);
    }
    filePatches.push(currentFilePatch);
  }

  // Filter out empty patches or files without valid naming
  return filePatches.filter(p => p.newFile && p.newFile !== "/dev/null");
}

/**
 * Applies parsed file patches to the project files via VFS.
 * Supports sliding window/fuzzy scanning to apply patches when target lines have shifted.
 */
export async function applyUnifiedPatch(
  vfs: IFileSystem,
  patchContent: string,
  dryRun: boolean = false
): Promise<{ success: boolean; results: { filePath: string; success: boolean; newContent?: string; error?: string }[] }> {
  const patches = parsePatch(patchContent);
  const results: { filePath: string; success: boolean; newContent?: string; error?: string }[] = [];
  let globalsuccess = true;

  for (const patch of patches) {
    const filePath = patch.newFile;
    try {
      // Read original contents
      let originalContent = await vfs.readFile(filePath);
      
      // If file doesn't exist and oldFile is /dev/null, treat as new file creation
      if (originalContent === null) {
        if (patch.oldFile === "/dev/null" || patch.oldFile === "" || patch.hunks.every(h => h.lines.every(l => l.startsWith("+")))) {
          originalContent = "";
        } else {
          results.push({
            filePath,
            success: false,
            error: `File not found in VFS: ${filePath}`
          });
          globalsuccess = false;
          continue;
        }
      }

      let fileLines = originalContent.split(/\r?\n/);
      let hunkOffset = 0; // Cumulative offset due to prior changes in this file

      let fileSuccess = true;
      let reason = "";

      for (const hunk of patch.hunks) {
        // Reconstruct old block to match and new block to insert
        const expectedOld: string[] = [];
        const replacementNew: string[] = [];

        for (const hunkLine of hunk.lines) {
          if (hunkLine.startsWith(" ")) {
            expectedOld.push(hunkLine.substring(1));
            replacementNew.push(hunkLine.substring(1));
          } else if (hunkLine.startsWith("-")) {
            expectedOld.push(hunkLine.substring(1));
          } else if (hunkLine.startsWith("+")) {
            replacementNew.push(hunkLine.substring(1));
          } else if (hunkLine === "") {
            expectedOld.push("");
            replacementNew.push("");
          }
        }

        // Try exact position first (computed by oldStart + cumulative offset)
        // Note: Git uses 1-based line indexing
        const targetIdx = (hunk.oldStart - 1) + hunkOffset;
        let matchedIdx = -1;

        // Check if expectedOld matches at targetIdx
        if (isMatchAt(fileLines, expectedOld, targetIdx)) {
          matchedIdx = targetIdx;
        } else {
          // Slide window around targetIdx to find match (Fuzzy offset tolerance)
          const searchRange = 500; // Look up to 500 lines above and below
          for (let dist = 1; dist <= searchRange; dist++) {
            const upIdx = targetIdx - dist;
            const downIdx = targetIdx + dist;

            if (upIdx >= 0 && isMatchAt(fileLines, expectedOld, upIdx)) {
              matchedIdx = upIdx;
              break;
            }
            if (downIdx <= fileLines.length - expectedOld.length && isMatchAt(fileLines, expectedOld, downIdx)) {
              matchedIdx = downIdx;
              break;
            }
          }
        }

        if (matchedIdx === -1) {
          fileSuccess = false;
          reason = `Failed to match diff hunk context around expected line ${hunk.oldStart}`;
          break;
        }

        // Apply replacement at matchedIdx
        fileLines.splice(matchedIdx, expectedOld.length, ...replacementNew);

        // Update hunkOffset for the next hunks in this file
        const linesDelta = replacementNew.length - expectedOld.length;
        hunkOffset += (matchedIdx - targetIdx) + linesDelta;
      }

      if (fileSuccess) {
        // Write the edited contents back
        const newFileContent = fileLines.join("\n");
        if (!dryRun) {
          await vfs.writeFile(filePath, newFileContent);
          logger.info(`[PatchApplier] Successfully applied unified patch to ${filePath}`);
        }
        results.push({ filePath, success: true, newContent: newFileContent });
      } else {
        results.push({ filePath, success: false, error: reason });
        globalsuccess = false;
        logger.error(`[PatchApplier] Failed to apply patch to ${filePath}: ${reason}`);
      }

    } catch (err: any) {
      results.push({ filePath, success: false, error: err.message || "Unknown error" });
      globalsuccess = false;
      logger.error({ err, filePath }, `[PatchApplier] Error patching file`);
    }
  }

  return { success: globalsuccess, results };
}

function isMatchAt(fileLines: string[], expectedOld: string[], idx: number): boolean {
  if (idx < 0 || idx + expectedOld.length > fileLines.length) {
    return false;
  }
  for (let i = 0; i < expectedOld.length; i++) {
    const fileLine = fileLines[idx + i].trimEnd();
    const expectedLine = expectedOld[i].trimEnd();
    if (fileLine !== expectedLine) {
      return false;
    }
  }
  return true;
}
