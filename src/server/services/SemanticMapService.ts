import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import fs from "fs";
import path from "path";
import chokidar, { FSWatcher } from "chokidar";
import { logger } from "../utils/logger.js";

export interface CodeSymbol {
  name: string;
  kind: string;
  line: number;
  endLine?: number;
  containerName?: string;
  filePath: string;
}

class SemanticMapService {
  private static instance: SemanticMapService;
  private symbolIndex: Map<string, CodeSymbol[]> = new Map();
  private rootPath: string = process.cwd();
  private watcher: FSWatcher | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): SemanticMapService {
    if (!SemanticMapService.instance) {
      SemanticMapService.instance = new SemanticMapService();
    }
    return SemanticMapService.instance;
  }

  public async startIndexing(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;

    // Load any existing index from directory
    this.loadRegistry();

    if (this.watcher) {
      await this.watcher.close();
    }

    // Set up real-time chokidar background watcher with strict ignoring
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: (filePath) => {
        const normalized = filePath.replace(/\\/g, "/");
        return normalized.includes("/node_modules/") || 
               normalized.includes("/dist/") || 
               normalized.includes("/.data/") || 
               normalized.includes("/.git/") ||
               normalized.endsWith("/node_modules") ||
               normalized.endsWith("/dist") ||
               normalized.endsWith("/.data") ||
               normalized.endsWith("/.git");
      },
      persistent: true,
      ignoreInitial: true // Prevents massive initial scanning overhead
    });

    this.watcher
      .on("add", (filePath) => {
        if (this.shouldIndex(filePath)) {
          this.indexFile(filePath);
        }
      })
      .on("change", (filePath) => {
        if (this.shouldIndex(filePath)) {
          this.indexFile(filePath);
        }
      })
      .on("unlink", (filePath) => {
        this.removeFileFromIndex(filePath);
      });

    logger.info(`[SemanticMap] Background chokidar-based tree-sitter daemon started watching with ignoreInitial: true`);

    // Perform a fast, non-blocking initial scan of src/ and server.ts
    this.scanAndIndexLocalFiles();
  }

  private async scanAndIndexLocalFiles() {
    try {
      const filesToScan: string[] = [];

      // Recursively find and deep-index all JavaScript/TypeScript files under rootPath, ignoring build artifact directories
      const crawl = async (dir: string) => {
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePart = path.relative(this.rootPath, fullPath).replace(/\\/g, "/");

            // Exclude directories we don't want to scan
            if (
              relativePart.includes("node_modules") ||
              relativePart.includes("dist") ||
              relativePart.includes(".git") ||
              relativePart.includes(".data") ||
              entry.name === "node_modules" ||
              entry.name === "dist" ||
              entry.name === ".git" ||
              entry.name === ".data"
            ) {
              continue;
            }

            if (entry.isDirectory()) {
              // Yield executing microtask block so express HTTP serving continues smoothly
              await new Promise((resolve) => setImmediate(resolve));
              await crawl(fullPath);
            } else if (entry.isFile() && this.shouldIndex(fullPath)) {
              filesToScan.push(fullPath);
            }
          }
        } catch (err) {
          // Ignore directory reading or access errors
        }
      };

      await crawl(this.rootPath);

      logger.info(`[SemanticMap] Startup recursive tree-sitter indexing found ${filesToScan.length} source files under workspace.`);

      // Index each file asynchronously with setImmediate
      for (const filePath of filesToScan) {
        await new Promise((resolve) => setImmediate(resolve));
        await this.indexFile(filePath);
      }
    } catch (err) {
      logger.error({ err }, "[SemanticMap] Failed recursive startup tree-sitter scan");
    }
  }

  private shouldIndex(filePath: string): boolean {
    const ext = path.extname(filePath);
    return [".ts", ".tsx", ".js", ".jsx"].includes(ext);
  }

  private loadRegistry() {
    try {
      const dataDir = path.join(this.rootPath, ".data");
      const registryPath = path.join(dataDir, "symbol_index.json");
      if (fs.existsSync(registryPath)) {
        const raw = fs.readFileSync(registryPath, "utf-8");
        const parsed = JSON.parse(raw);
        let count = 0;
        let purged = 0;
        for (const [key, value] of Object.entries(parsed)) {
          const normalizedKey = key.replace(/\\/g, "/");
          // Keep only files inside src/ or server.ts
          if (normalizedKey.startsWith("src/") || normalizedKey === "server.ts") {
            this.symbolIndex.set(key, value as CodeSymbol[]);
            count++;
          } else {
            purged++;
          }
        }
        logger.info(`[SemanticMap] Loaded local tree-sitter symbol index containing ${count} files (purged ${purged} stale elements)`);
        if (purged > 0) {
          this.saveRegistry();
        }
      }
    } catch (err) {
      logger.error({ err }, "[SemanticMap] Failed to load local JSON symbol index");
    }
  }

  private saveRegistry() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(async () => {
      try {
        const dataDir = path.join(this.rootPath, ".data");
        await fs.promises.mkdir(dataDir, { recursive: true }).catch(() => {});
        const registryPath = path.join(dataDir, "symbol_index.json");
        const data = JSON.stringify(Object.fromEntries(this.symbolIndex), null, 2);
        await fs.promises.writeFile(registryPath, data, "utf-8");
        logger.debug("[SemanticMap] Saved symbol index to disk.");
      } catch (err) {
        logger.error({ err }, "[SemanticMap] Failed to save symbol index registry to disk");
      }
    }, 1000);
  }

  private async indexFile(filePath: string) {
    try {
      const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        await this.removeFileFromIndex(filePath);
        return;
      }
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) return;

      const content = await fs.promises.readFile(filePath, "utf-8");
      
      // Delay to yield context to incoming requests / other microtasks
      await new Promise((resolve) => setImmediate(resolve));

      const symbols = this.parseCodeAndExtractSymbols(filePath, content);

      const relativePath = path.relative(process.cwd(), filePath);
      this.symbolIndex.set(relativePath, symbols);
      this.saveRegistry();
    } catch (err) {
      logger.error({ err, filePath }, "[SemanticMap] Failed to index file");
    }
  }

  private async removeFileFromIndex(filePath: string) {
    const relativePath = path.relative(process.cwd(), filePath);
    if (this.symbolIndex.has(relativePath)) {
      this.symbolIndex.delete(relativePath);
      logger.info(`[SemanticMap] Removed file from registry: ${relativePath}`);
      this.saveRegistry();
    }
  }

  /**
   * Natively extracts TypeScript and React symbols from code with Tree-Sitter
   */
  public parseCodeAndExtractSymbols(filePath: string, content: string): CodeSymbol[] {
    const ext = path.extname(filePath);
    const resolvedModule = (TypeScript as any).default || TypeScript;
    const isTsx = ext === ".tsx" || ext === ".jsx";
    const language = isTsx ? resolvedModule.tsx : resolvedModule.typescript;

    const parser = new Parser();
    parser.setLanguage(language);

    const chunkInput = (offset: number) => {
      if (offset >= content.length) return null;
      return content.slice(offset, offset + 1024);
    };
    const tree = parser.parse(chunkInput);
    const symbols: CodeSymbol[] = [];
    const relativePath = path.relative(this.rootPath, filePath) || filePath;

    const defs = new Set<string>();

    // First pass: identify definition names to differentiate definitions from references
    function findDefs(node: Parser.SyntaxNode | null, isExported: boolean = false) {
      if (!node) return;
      if (node.type === "export_statement") {
        for (let i = 0; i < node.childCount; i++) {
          findDefs(node.child(i), true);
        }
        return;
      }

      let nameNode: Parser.SyntaxNode | undefined;
      if (node.type === "function_declaration") {
        nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "identifier");
      } else if (node.type === "class_declaration") {
        nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
      } else if (node.type === "interface_declaration") {
        nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
      } else if (node.type === "type_alias_declaration") {
        nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
      } else if (node.type === "method_definition") {
        nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "property_identifier" || c.type === "identifier");
      } else if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
        const declarators = node.children.filter(c => c.type === "variable_declarator");
        for (const d of declarators) {
          const dName = d.childForFieldName("name") || d.children.find(c => c.type === "identifier");
          if (dName) {
            defs.add(`${dName.startPosition.row},${dName.startPosition.column}`);
          }
        }
      }

      if (nameNode) {
        defs.add(`${nameNode.startPosition.row},${nameNode.startPosition.column}`);
      }

      for (let i = 0; i < node.childCount; i++) {
        findDefs(node.child(i), isExported);
      }
    }

    findDefs(tree.rootNode);

    // Second pass: extract structured symbols and real references
    function traverse(node: Parser.SyntaxNode | null, isExported: boolean = false) {
      if (!node) return;
      if (node.type === "export_statement") {
        for (let i = 0; i < node.childCount; i++) {
          traverse(node.child(i), true);
        }
        return;
      }

      if (node.type === "function_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "identifier");
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: "function",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            filePath: relativePath
          });
        }
      } else if (node.type === "class_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: "class",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            filePath: relativePath
          });
        }
      } else if (node.type === "interface_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: "interface",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            filePath: relativePath
          });
        }
      } else if (node.type === "type_alias_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: "type",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            filePath: relativePath
          });
        }
      } else if (node.type === "method_definition") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "property_identifier" || c.type === "identifier");
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: "method",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            filePath: relativePath
          });
        }
      } else if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
        if (isExported) {
          const declarators = node.children.filter(c => c.type === "variable_declarator");
          for (const d of declarators) {
            const nameNode = d.childForFieldName("name") || d.children.find(c => c.type === "identifier");
            if (nameNode) {
              symbols.push({
                name: nameNode.text,
                kind: "variable",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                filePath: relativePath
              });
            }
          }
        }
      } else if ((node.type === "identifier" || node.type === "type_identifier") && node.text) {
        const pos = `${node.startPosition.row},${node.startPosition.column}`;
        if (!defs.has(pos)) {
          symbols.push({
            name: node.text,
            kind: "reference",
            line: node.startPosition.row + 1,
            filePath: relativePath
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i), isExported);
      }
    }

    traverse(tree.rootNode);
    return symbols;
  }

  /**
   * Generates a fully formatted, human-readable summary semantic map of a file on demand.
   * Leveraged by AI agent tools to fetch structure layout.
   */
  public getFormattedMap(filePath: string, content: string): string {
    const ext = path.extname(filePath);
    const resolvedModule = (TypeScript as any).default || TypeScript;
    const isTsx = ext === ".tsx" || ext === ".jsx";
    const language = isTsx ? resolvedModule.tsx : resolvedModule.typescript;

    const parser = new Parser();
    parser.setLanguage(language);

    const chunkInput = (offset: number) => {
      if (offset >= content.length) return null;
      return content.slice(offset, offset + 1024);
    };
    const tree = parser.parse(chunkInput);
    const symbolsText: string[] = [];

    function traverse(node: Parser.SyntaxNode | null, isExported: boolean = false) {
      if (!node) return;
      if (node.type === "export_statement") {
        for (let i = 0; i < node.childCount; i++) {
          traverse(node.child(i), true);
        }
        return;
      }

      if (node.type === "function_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "identifier");
        if (nameNode) {
          symbolsText.push(`Function: ${nameNode.text}`);
        }
      } else if (node.type === "class_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbolsText.push(`Class: ${nameNode.text}`);
        }
      } else if (node.type === "interface_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbolsText.push(`Interface: ${nameNode.text}`);
        }
      } else if (node.type === "type_alias_declaration") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "type_identifier");
        if (nameNode) {
          symbolsText.push(`Type: ${nameNode.text}`);
        }
      } else if (node.type === "method_definition") {
        const nameNode = node.childForFieldName("name") || node.children.find(c => c.type === "property_identifier" || c.type === "identifier");
        if (nameNode) {
          symbolsText.push(`Method: ${nameNode.text}`);
        }
      } else if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
        if (isExported) {
          const declarators = node.children.filter(c => c.type === "variable_declarator");
          for (const d of declarators) {
            const nameNode = d.childForFieldName("name") || d.children.find(c => c.type === "identifier");
            if (nameNode) {
              symbolsText.push(`Exported Variable: ${nameNode.text}`);
            }
          }
        }
      } else if (node.type === "import_statement") {
        const importClause = node.children.find(c => c.type === "import_clause");
        const moduleStringNode = node.children.find(c => c.type === "string");
        const fromModule = moduleStringNode ? moduleStringNode.text.replace(/['"]/g, "") : "unknown";
        const importClauseText = importClause ? importClause.text : "{ ... }";
        symbolsText.push(`Import: ${importClauseText} from '${fromModule}'`);
      }

      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i), isExported);
      }
    }

    traverse(tree.rootNode);
    if (symbolsText.length === 0) return "No significant structural symbols found (or file is simple).";
    return `Semantic Map for ${filePath}:\n` + symbolsText.map(s => `- ${s}`).join('\n');
  }

  public query(term: string): CodeSymbol[] {
    const results: CodeSymbol[] = [];
    const lowerTerm = term.toLowerCase();

    for (const symbols of this.symbolIndex.values()) {
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase().includes(lowerTerm)) {
          results.push(symbol);
        }
      }
    }
    return results;
  }

  public getMap() {
    return Object.fromEntries(this.symbolIndex);
  }
}

export const semanticMapService = SemanticMapService.getInstance();
