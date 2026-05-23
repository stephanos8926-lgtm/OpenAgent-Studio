import { tool } from "@langchain/core/tools";
import { z } from "zod";
import ts from "typescript";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { IFileSystem } from "../../services/vfs/index.js";
import { getConfig } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

const execPromise = promisify(exec);

import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import { spawn } from "child_process";

// We'll replace execPromise inside shell_exec with a custom function
const spawnAndStream = (command: string, cwd: string, timeoutMs: number): Promise<{stdout: string, stderr: string}> => {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const maxBufferSize = 50000;

    const child = spawn(command, { 
      cwd, 
      shell: true,
      env: { 
        ...process.env, 
        NODE_ENV: 'development', 
        PORT: '0',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1'
      }
    });

    let timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', async (data) => {
        const chunk = data.toString();
        if (stdout.length < maxBufferSize) stdout += chunk;
        await dispatchCustomEvent("terminal_output", { chunk });
    });

    child.stderr.on('data', async (data) => {
        const chunk = data.toString();
        if (stderr.length < maxBufferSize) stderr += chunk;
        await dispatchCustomEvent("terminal_output", { chunk });
    });

    child.on('close', (code) => {
       clearTimeout(timeoutId);
       const finalStdout = stdout.length >= maxBufferSize ? stdout + "\n... (truncated)" : stdout;
       const finalStderr = stderr.length >= maxBufferSize ? stderr + "\n... (truncated)" : stderr;
       if (code === 0) resolve({ stdout: finalStdout, stderr: finalStderr });
       else resolve({ stdout: finalStdout, stderr: `[Error Code ${code}] ${finalStderr}` });
    });

    child.on('error', (err) => {
       clearTimeout(timeoutId);
       reject(err);
    });
  });
};

import { scheduler } from "../../services/SchedulerService.js";

import { semanticSearchTool } from "./SemanticSearchTool.js";
import { semanticMapService } from "../../services/SemanticMapService.js";
import { commandApprovalService } from "../../services/CommandApprovalService.js";
import crypto from "crypto";

export const logToolFailure = async (toolName: string, args: any, errorMsg: string) => {
  try {
    const dataDir = path.join(process.cwd(), ".data");
    await fs.mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, "tool_failures.json");
    let failures: any[] = [];
    try {
      const content = await fs.readFile(filePath, "utf-8");
      failures = JSON.parse(content);
    } catch (e) {
      // Ignore reading error if file doesn't exist
    }
    const failureId = crypto.randomUUID();
    const newFailure = {
      id: failureId,
      timestamp: new Date().toISOString(),
      toolName,
      arguments: args,
      error: errorMsg,
      context: `Execution failed during tool invocation of ${toolName}`
    };
    failures.push(newFailure);
    await fs.writeFile(filePath, JSON.stringify(failures, null, 2), "utf-8");
    return failureId;
  } catch (err) {
    logger.error({ err }, "Failed to write tool failure to disk");
    return crypto.randomUUID();
  }
};

export const toolRegistryMetadata = [
  {
    name: "write_file",
    canonicalName: "write_file",
    useCases: ["creating a new file", "overwriting an existing file with full content", "saving code assets", "initial setup"],
    description: "Write content to a file in the workspace.",
    schemaDescription: "Requires 'path' (string) and 'content' (string).",
    tip: "Always read code first or list directory to ensure the path doesn't already exist or to keep existing structures coherent. Do not use this if you want to perform a small, surgical update to an existing file; use edit_file instead."
  },
  {
    name: "read_file",
    canonicalName: "read_file",
    useCases: ["reading file contents", "verifying existing code", "loading configurations", "examining source files"],
    description: "Read the contents of a file in the workspace.",
    schemaDescription: "Requires 'path' (string).",
    tip: "Use read_file before modifying a file to see its exact content, verifying any leading/trailing spaces or imports exactly."
  },
  {
    name: "edit_file",
    canonicalName: "edit_file",
    useCases: ["modifying an existing file", "replacing code blocks", "updating source code surgically", "applying chunk patches"],
    description: "Edit an existing file using precise substring or targeted chunk replacement.",
    schemaDescription: "Requires 'path' (string). Supports mode='exact' with 'target' & 'replacement', or mode='chunks' with 'chunks' array of target/replacement pairs.",
    tip: "We support two powerful modes. Mode 'exact' replaces a precise target substring. Mode 'chunks' lets you apply multiple non-contiguous chunk replacements. If replacement fails with 'target not found', verify whitespace precisely or run read_file."
  },
  {
    name: "delete_file",
    canonicalName: "delete_file",
    useCases: ["removing unwanted files", "cleanup", "refactoring by removing deprecated modules"],
    description: "Delete a file from the workspace.",
    schemaDescription: "Requires 'path' (string).",
    tip: "Only delete files you are absolutely sure are no longer needed. Double check list_dir first."
  },
  {
    name: "list_dir",
    canonicalName: "list_dir",
    useCases: ["exploring directories", "listing files", "finding where assets are placed", "project overview"],
    description: "List all files currently in the workspace.",
    schemaDescription: "No arguments required.",
    tip: "Run list_dir at the beginning of a session or when searching for the layout of files."
  },
  {
    name: "shell_exec",
    canonicalName: "shell_exec",
    useCases: ["running builds", "executing tests", "checking types/linter", "running scripts"],
    description: "Executes a shell command in the workspace.",
    schemaDescription: "Requires 'command' (string).",
    tip: "Permitted commands are limited. Chaining commands, redirection, or destructive actions like rm are blocked unless reviewed or in YOLO mode. Always run npm run build or npm run lint to verify after edits."
  },
  {
    name: "get_semantic_map",
    canonicalName: "get_semantic_map",
    useCases: ["mapping class/function structure", "AST parsing", "understanding file imports/exports", "scanning huge files"],
    description: "Parse a TypeScript/JavaScript file into an AST and return a summary of its members.",
    schemaDescription: "Requires 'path' (string).",
    tip: "Excellent for understanding large files without reading the entire code block into context, hence preserving valuable token limits."
  },
  {
    name: "index",
    canonicalName: "index",
    useCases: ["finding symbol locations", "searching project-wide classes", "finding export references", "global code registry lookups"],
    description: "Query real-time symbol registry location data (exported functions, classes, interfaces, or variables).",
    schemaDescription: "Requires optional 'query' (string).",
    tip: "Highly recommended for fast searches across the entire codebase to locate where a specific function, interface, or variable is exported."
  },
  {
    name: "semanticSearchTool",
    canonicalName: "semanticSearchTool",
    useCases: ["embedding search", "context search", "locating code by conceptual query", "finding semantic matches"],
    description: "Semantic embedding-based search over documents and codebase.",
    schemaDescription: "Requires 'query' (string).",
    tip: "Use this to search the codebase conceptually (e.g. 'how is authentication structured') rather than via literal matches."
  },
  {
    name: "schedule_task",
    canonicalName: "schedule_task",
    useCases: ["background auditing", "recurring cron jobs", "periodical checks", "health reminders"],
    description: "Registers a recurring background task using cron syntax.",
    schemaDescription: "Requires 'name', 'cron', and 'taskDescription'.",
    tip: "Use this for registering daily audit checks or self-heals."
  },
  {
    name: "tool_search",
    canonicalName: "tool_search",
    useCases: ["recovering from tool failures", "fuzzy tool lookup", "checking tool registry", "reading tool usage guides"],
    description: "Search for available tools by name, use cases, or tool failure ID.",
    schemaDescription: "Accepts 'query' (string), 'failureId' (string), 'includeTip' (boolean), 'requestAllRegistry' (boolean).",
    tip: "When any tool fails with a failure ID, pass that ID here immediately to get context-specific diagnostics and correct arguments."
  }
];

export const createTools = (vfs: IFileSystem) => {
  const config = getConfig();

  const schedule_task = tool(
    async ({ name, cron, taskDescription }) => {
      // In a real agentic swarm, this task would trigger a NEW LangGraph run
      // For now, we simulate by logging the scheduled operation.
      // A more complex implementation would involve adding a message to the task queue.
      scheduler.registerJob(
        `agent-task-${Date.now()}`,
        cron,
        async () => {
          logger.info(`[Dynamic Task] Running scheduled task: ${name}`);
          logger.info(`[Description]: ${taskDescription}`);
          // Triggering a background repair or audit run would go here.
        },
        name
      );
      return `Successfully scheduled task '${name}' with cron '${cron}'.`;
    },
    {
      name: "schedule_task",
      description: "Registers a recurring background task using cron syntax. Use this for periodic audits, reminders, or health checks.",
      schema: z.object({
        name: z.string().describe("Descriptive name of the task"),
        cron: z.string().describe("Standard cron expression (e.g. '0 * * * *' for every hour)"),
        taskDescription: z.string().describe("A detailed description of what should happen during the run.")
      })
    }
  );

  const write_file = tool(
    async ({ path: filePath, content }, { configurable }) => {
      const mode = configurable?.execution_mode || 'normal';
      
      if (mode === 'yolo') {
        await vfs.writeFile(filePath, content);
        return `Successfully wrote ${filePath}`;
      }

      // Read current content for diffing
      const originalContent = await vfs.readFile(filePath) || "";
      
      // Dispatch event to UI
      await dispatchCustomEvent("proposed_change", {
        type: 'write',
        path: filePath,
        originalContent,
        proposedContent: content,
        mode
      });

      return `Proposed change to ${filePath} has been sent for user review. Waiting for approval...`;
    },
    {
      name: "write_file",
      description: "Write content to a file in the workspace. In Plan/Normal modes, this creates a PROPOSAL for user review. In YOLO mode, it writes directly.",
      schema: z.object({
        path: z.string().describe("The file path, e.g., index.html, style.css, src/main.js"),
        content: z.string().describe("The full content of the file. Do not truncate."),
      }),
    }
  );

  const delete_file = tool(
    async ({ path }) => {
      const deleted = await vfs.deleteFile(path);
      if (deleted) {
        return `Successfully deleted ${path}`;
      }
      return `File ${path} not found.`;
    },
    {
      name: "delete_file",
      description: "Delete a file from the workspace.",
      schema: z.object({
        path: z.string().describe("The file path to delete"),
      }),
    }
  );

  const read_file = tool(
    async ({ path }) => {
      const content = await vfs.readFile(path);
      if (content !== null) {
        return content;
      }
      return `File ${path} not found.`;
    },
    {
      name: "read_file",
      description: "Read the contents of a file in the workspace.",
      schema: z.object({
        path: z.string().describe("The file path to read"),
      }),
    }
  );

  const list_dir = tool(
    async () => {
      const files = await vfs.listFiles();
      if (files.length === 0) return "Workspace is empty.";
      return files.map(f => `- ${f}`).join("\n");
    },
    {
      name: "list_dir",
      description: "List all files currently in the workspace.",
      schema: z.object({}),
    }
  );

  const edit_file = tool(
    async ({ path: filePath, mode = "exact", target, replacement, chunks }, { configurable }) => {
      const execMode = configurable?.execution_mode || 'normal';
      const content = await vfs.readFile(filePath);
      if (content === null) {
        const errMsg = `File ${filePath} not found.`;
        const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
        return `Error: ${errMsg} Failure ID: ${failureId}. Please run read_file first or list_dir to locate correct files.`;
      }

      let newContent = content;
      if (mode === "exact") {
        if (!target) {
          const errMsg = "Parameter 'target' is required in 'exact' mode.";
          const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
          return `Error: ${errMsg} Failure ID: ${failureId}.`;
        }
        if (!content.includes(target)) {
          const errMsg = `Target string not found in ${filePath}.`;
          const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
          return `Error: ${errMsg} Ensure you provide the exact substring including whitespace. Failure ID: ${failureId}. Tip or help: call tool_search with this failureId.`;
        }
        newContent = content.replace(target, replacement || "");
      } else if (mode === "chunks") {
        if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
          const errMsg = "Parameter 'chunks' must be a non-empty array in 'chunks' mode.";
          const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
          return `Error: ${errMsg} Failure ID: ${failureId}.`;
        }

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk.target) {
            const errMsg = `Chunk index ${i} is missing 'target' substring.`;
            const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
            return `Error: ${errMsg} Failure ID: ${failureId}.`;
          }
          if (!newContent.includes(chunk.target)) {
            const errMsg = `Chunk index ${i} target string not found in ${filePath}: "${chunk.target.substring(0, 80)}"`;
            const failureId = await logToolFailure("edit_file", { path: filePath, mode, target, replacement, chunks }, errMsg);
            return `Error: ${errMsg}. Ensure whitespace and lines match exactly. Failure ID: ${failureId}. Tip or help: call tool_search with this failureId.`;
          }
          newContent = newContent.replace(chunk.target, chunk.replacement || "");
        }
      }

      if (execMode === 'yolo') {
        await vfs.writeFile(filePath, newContent);
        return `Successfully edited ${filePath}`;
      }

      await dispatchCustomEvent("proposed_change", {
        type: 'edit',
        path: filePath,
        originalContent: content,
        proposedContent: newContent,
        mode,
        chunks: mode === 'chunks' ? chunks.map((c, i) => ({
          id: `chunk-${i}`,
          target: c.target,
          replacement: c.replacement,
          description: c.description,
          status: 'pending'
        })) : undefined
      });

      return `Proposed edit to ${filePath} has been sent for user review. Waiting for approval...`;
    },
    {
      name: "edit_file",
      description: "Edit an existing file by replacing specific substrings. Supports 'exact' mode (substituting a single 'target' block with 'replacement') and 'chunks' mode (substituting a list of target/replacement chunks). In Plan/Normal modes, this creates a PROPOSAL for user review. In YOLO mode, it writes directly.",
      schema: z.object({
        path: z.string().describe("The file path to edit"),
        mode: z.enum(["exact", "chunks"]).default("exact").describe("The mode of operation: 'exact' or 'chunks'"),
        target: z.string().optional().describe("The exact substring to replace. Required if mode is 'exact'."),
        replacement: z.string().optional().describe("The content to replace the target substring with. Required if mode is 'exact'."),
        chunks: z.array(z.object({
          target: z.string().describe("The exact target substring of this chunk to find & replace"),
          replacement: z.string().describe("The replacement substring for this chunk"),
          description: z.string().optional().describe("A brief developer-friendly description of what this chunk changes")
        })).optional().describe("Array of targeted chunk replacements. Required if mode is 'chunks'.")
      }),
    }
  );

  const shell_exec = tool(
    async ({ command }, { configurable }) => {
      const allowedCommands = config.agent.allowedCommands;
      const baseCmd = command.trim().split(' ')[0];
      if (!allowedCommands.includes(baseCmd)) {
        return `Security Error: Command '${baseCmd}' is not permitted. Allowed commands: ${allowedCommands.join(', ')}`;
      }
      if (command.match(/[;|&>]/)) {
          return `Security Error: Chaining or redirecting commands is restricted for MVP security.`;
      }

      const isDestructive = (cmd: string): boolean => {
        const norm = cmd.trim().toLowerCase();
        const words = norm.split(/\s+/);
        if (words.includes('rm')) return true;
        if (norm.includes('npm uninstall') || norm.includes('npm un ') || norm.includes('npm un\t')) return true;
        if (norm.includes('yarn remove')) return true;
        if (norm.includes('pnpm remove')) return true;
        if (norm.includes('git reset --hard')) return true;
        if (norm.includes('git clean')) return true;
        return false;
      };

      const mode = configurable?.execution_mode || 'normal';
      const isDestructiveCommand = isDestructive(command);

      if (isDestructiveCommand && mode !== 'yolo') {
        const approvalId = crypto.randomUUID();
        await dispatchCustomEvent("terminal_output", { chunk: `\n[WARDEN] PAUSED: Potentially destructive command detected: '${command}'. Waiting for user approval...\n` });
        
        await dispatchCustomEvent("proposed_command", {
          id: approvalId,
          command,
          mode
        });

        const approved = await commandApprovalService.registerApproval(approvalId);
        if (!approved) {
          await dispatchCustomEvent("terminal_output", { chunk: `\n[WARDEN] REJECTED: Command execution blocked by the user.\n` });
          return `Security Execution Blocked: Destructive command '${command}' was rejected by the user.`;
        }

        await dispatchCustomEvent("terminal_output", { chunk: `\n[WARDEN] APPROVED: Resuming command execution...\n` });
      }
      
      await dispatchCustomEvent("terminal_output", { chunk: `\n> ${command}\n` });

      if (vfs.type === 'host' && vfs.basePath) {
        // Direct host execution
        try {
          const { stdout, stderr } = await spawnAndStream(
            command, 
            vfs.basePath, 
            config.agent.executionTimeoutMs
          );
          return `Stdout:\n${stdout}\n\nStderr:\n${stderr}`;
        } catch (error: any) {
          return `Execution Failed:\n${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`;
        }
      }

      // Memory VFS Sandboxed Execution
      try {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), config.agent.tempDirPrefix));
        const filesMap = await vfs.getFiles();
        
        for (const [filePath, content] of Object.entries(filesMap)) {
           const fullPath = path.join(tempDir, filePath);
           await fs.mkdir(path.dirname(fullPath), { recursive: true });
           await fs.writeFile(fullPath, content as string, 'utf-8');
        }

        const { stdout, stderr } = await spawnAndStream(
          command, 
          tempDir, 
          config.agent.executionTimeoutMs
        );

        const filesToSync = ['package.json', 'package-lock.json', 'yarn.lock'];
        for (const file of filesToSync) {
          try {
            const updatedContent = await fs.readFile(path.join(tempDir, file), 'utf-8');
            if (updatedContent) await vfs.writeFile(file, updatedContent);
          } catch (e) {
            // File might not exist
          }
        }

        await fs.rm(tempDir, { recursive: true, force: true });
        
        return `Stdout:\n${stdout}\n\nStderr:\n${stderr}`;
      } catch (error: any) {
        // Also cleanup on error
        const tempDirs = await fs.readdir(os.tmpdir());
        const agentDirs = tempDirs.filter(d => d.startsWith(config.agent.tempDirPrefix));
        for (const d of agentDirs) {
            await fs.rm(path.join(os.tmpdir(), d), { recursive: true, force: true }).catch(() => {});
        }
        return `Execution Failed:\n${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`;
      }
    },
    {
      name: "shell_exec",
      description: "Executes a shell command in the workspace. Output is streamed live to the terminal UI. Returns final stdout/stderr summary.",
      schema: z.object({
        command: z.string().describe("The shell command to execute."),
      }),
    }
  );

  const get_semantic_map = tool(
    async ({ path: filePath }) => {
      const code = await vfs.readFile(filePath);
      if (code === null) {
        return `File ${filePath} not found.`;
      }
      try {
        const sourceFile = ts.createSourceFile(
          filePath,
          code,
          ts.ScriptTarget.Latest,
          true
        );
      
        const symbols: string[] = [];
      
        function visit(node: ts.Node) {
          if (ts.isFunctionDeclaration(node) && node.name) {
            symbols.push(`Function: ${node.name.text}`);
          } else if (ts.isClassDeclaration(node) && node.name) {
            symbols.push(`Class: ${node.name.text}`);
          } else if (ts.isInterfaceDeclaration(node)) {
            symbols.push(`Interface: ${node.name.text}`);
          } else if (ts.isTypeAliasDeclaration(node)) {
            symbols.push(`Type: ${node.name.text}`);
          } else if (ts.isVariableStatement(node)) {
              const isExported = node.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
              if (isExported) {
                   node.declarationList.declarations.forEach((d: any) => {
                       if (ts.isIdentifier(d.name)) {
                           symbols.push(`Exported Variable: ${d.name.text}`);
                       }
                   });
              }
          } else if (ts.isImportDeclaration(node)) {
              const moduleSpecifier = (node.moduleSpecifier as any).text;
              let importClause = "";
              if (node.importClause) {
                  if (node.importClause.name) importClause += node.importClause.name.text + ", ";
                  if (node.importClause.namedBindings) {
                      importClause += "{ ... }";
                  }
              }
              symbols.push(`Import: ${importClause} from '${moduleSpecifier}'`);
          }
          ts.forEachChild(node, visit);
        }
      
        visit(sourceFile);
        
        if (symbols.length === 0) return "No significant structural symbols found (or file is simple).";
        return `Semantic Map for ${filePath}:\n` + symbols.map(s => `- ${s}`).join('\n');
      } catch (e: any) {
        return `Error parsing AST: ${e.message}`;
      }
    },
    {
      name: "get_semantic_map",
      description: "Parse a TypeScript/JavaScript file into an Abstract Syntax Tree (AST) and return a summary map of its imports, exports, functions, and classes. Useful for large files to save context window.",
      schema: z.object({
        path: z.string().describe("The file path to map"),
      }),
    }
  );

  const index = tool(
    async ({ query }) => {
      try {
        if (!query || query.trim() === "") {
          const allMap = semanticMapService.getMap();
          return `Cached Real-time Symbol Registry Index:\n${JSON.stringify(allMap, null, 2)}`;
        }
        const results = semanticMapService.query(query);
        if (results.length === 0) {
          return `No symbols matching query "${query}" found.`;
        }
        return `Matching Symbols found in registry:\n${JSON.stringify(results, null, 2)}`;
      } catch (err: any) {
        return `Failed to query symbol registry: ${err.message}`;
      }
    },
    {
      name: "index",
      description: "Query real-time symbol registry location data (exported functions, classes, interfaces, or variables) without having to read full files. Highly recommended over reading massive files.",
      schema: z.object({
        query: z.string().describe("Case-insensitive keyword to look up (e.g., 'getSuperOS', 'persistenceService')").optional()
      })
    }
  );

  const tool_search = tool(
    async ({ query, failureId, includeTip, requestAllRegistry }) => {
      try {
        if (requestAllRegistry) {
          return `Tool Registry Details:\n${JSON.stringify(toolRegistryMetadata, null, 2)}`;
        }

        if (failureId) {
          const filePath = path.join(process.cwd(), ".data", "tool_failures.json");
          let failureLog: any = null;
          try {
            const dataStr = await fs.readFile(filePath, "utf-8");
            const logs = JSON.parse(dataStr);
            if (Array.isArray(logs)) {
              failureLog = logs.find((l: any) => l.id === failureId);
            }
          } catch (e) {
            // failed to read or find
          }

          if (failureLog) {
            // Match failure to a tool recommendation
            let recommendation = `Failure Log Found and Analyzed for Failure ID: ${failureId}\n`;
            recommendation += `- Attempted Tool: ${failureLog.toolName}\n`;
            recommendation += `- Passed Arguments: ${JSON.stringify(failureLog.arguments, null, 2)}\n`;
            recommendation += `- Occurred Error: ${failureLog.error}\n\n`;

            // Detect mismatch and recommend correct tool / tip
            let targetTool;
            if (failureLog.toolName === "edit_file" && (failureLog.error.includes("Target") || failureLog.error.includes("target"))) {
              targetTool = toolRegistryMetadata.find(t => t.name === "edit_file");
              recommendation += `DIAGNOSTICS & TIP:\n`;
              recommendation += `The target string you passed did not match any content in the target file. To resolve this:\n`;
              recommendation += `1. Call 'read_file' first on the target path to see the exact code line-by-line.\n`;
              recommendation += `2. Copy-paste the exact target code segment, including any semicolons, commas, parenthesis, and spacing.\n`;
              recommendation += `3. Alternatively, you can use edit_file in 'chunks' mode with smaller, precise chunks of code, or overwrite the whole file using 'write_file' if you intend to do a large rewrite.\n`;
            } else if (failureLog.toolName === "shell_exec") {
              targetTool = toolRegistryMetadata.find(t => t.name === "shell_exec");
              recommendation += `DIAGNOSTICS & TIP:\n`;
              recommendation += `A shell execution failed or checked restrictions. Ensure you are only running approved commands: 'npm run build', 'npm run lint', 'tsc --noEmit', or similar test-runners. Never chain operators like ';' or '|'.\n`;
            } else {
              targetTool = toolRegistryMetadata.find(t => t.name === failureLog.toolName) || toolRegistryMetadata.find(t => t.name === "tool_search");
            }

            if (targetTool) {
              recommendation += `\nRECOMMENDED CANONICAL TOOL:\n`;
              recommendation += `- Name: ${targetTool.canonicalName}\n`;
              recommendation += `- Description: ${targetTool.description}\n`;
              recommendation += `- Use Cases: ${targetTool.useCases.join(', ')}\n`;
              if (includeTip) {
                recommendation += `- Custom Usage Tip: ${targetTool.tip}\n`;
              }
            }
            return recommendation;
          } else {
            return `No failure log found matching failure ID: ${failureId}. Please verify the ID or search tools using the 'query' parameter.`;
          }
        }

        if (query) {
          const lower = query.toLowerCase();
          const results = toolRegistryMetadata.filter(t => 
            t.name.toLowerCase().includes(lower) || 
            t.description.toLowerCase().includes(lower) || 
            t.useCases.some(u => u.toLowerCase().includes(lower))
          );

          if (results.length === 0) {
            return `No tools matching query "${query}" found in registry. Try searching for broader terms like 'file', 'read', 'code', 'build', or set 'requestAllRegistry' to true.`;
          }

          let response = `Fuzzy Matching Tools for Query "${query}":\n\n`;
          results.forEach(t => {
            response += `### Tool: ${t.canonicalName}\n`;
            response += `- Description: ${t.description}\n`;
            response += `- Use Cases: ${t.useCases.join(', ')}\n`;
            response += `- Schema Info: ${t.schemaDescription}\n`;
            if (includeTip) {
              response += `- Tip: ${t.tip}\n`;
            }
            response += `\n`;
          });
          return response;
        }

        return "Please provide either a 'query', 'failureId', or set 'requestAllRegistry' to true to search tools.";
      } catch (err: any) {
        return `Failed to search tools: ${err.message}`;
      }
    },
    {
      name: "tool_search",
      description: "Search for available tools, diagnose tool call errors using a failure ID, or get the entire tool registry of the agent swarm.",
      schema: z.object({
        query: z.string().describe("Fuzzy or exact keyword search targeting tool name, description, or use cases.").optional(),
        failureId: z.string().describe("The UUIDv4 tool call failure ID returned from a previous failed tool execution to get targeted recovery tips.").optional(),
        includeTip: z.boolean().describe("Include detailed custom hints and tips on the recommended tools.").optional(),
        requestAllRegistry: z.boolean().describe("Retrieve detailed documentation for all tools available in the agent toolkit.").optional()
      })
    }
  );

  return [
    write_file, 
    delete_file, 
    read_file, 
    list_dir, 
    edit_file, 
    shell_exec, 
    get_semantic_map, 
    schedule_task,
    semanticSearchTool,
    index,
    tool_search
  ];
};
