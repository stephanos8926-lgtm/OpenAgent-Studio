import ts from "typescript";
import fs from "fs";
import path from "path";
import chokidar, { FSWatcher } from "chokidar";
import { logger } from "../utils/logger.js";

export interface CodeSymbol {
  name: string;
  kind: string;
  line: number;
  containerName?: string;
  filePath: string;
}

class SemanticMapService {
  private static instance: SemanticMapService;
  private symbolIndex: Map<string, CodeSymbol[]> = new Map();
  private isIndexing: boolean = false;
  private rootPath: string = process.cwd();
  private watcher: FSWatcher | null = null;

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

    // Set up real-time chokidar background watcher
    this.watcher = chokidar.watch(this.rootPath, {
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.data/**",
        "**/.git/**"
      ],
      persistent: true,
      ignoreInitial: false
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

    logger.info(`[SemanticMap] Background chokidar-based daemon started watching: ${this.rootPath}`);
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
        for (const [key, value] of Object.entries(parsed)) {
          this.symbolIndex.set(key, value as CodeSymbol[]);
        }
        logger.info(`[SemanticMap] Successfully loaded local symbol index containing ${this.symbolIndex.size} files`);
      }
    } catch (err) {
      logger.error({ err }, "[SemanticMap] Failed to load local JSON symbol index");
    }
  }

  private saveRegistry() {
    try {
      const dataDir = path.join(this.rootPath, ".data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const registryPath = path.join(dataDir, "symbol_index.json");
      const data = JSON.stringify(Object.fromEntries(this.symbolIndex), null, 2);
      fs.writeFileSync(registryPath, data, "utf-8");
    } catch (err) {
      logger.error({ err }, "[SemanticMap] Failed to save symbol index registry to disk");
    }
  }

  private indexFile(filePath: string) {
    try {
      if (!fs.existsSync(filePath)) {
        this.removeFileFromIndex(filePath);
        return;
      }
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) return;

      const content = fs.readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const symbols: CodeSymbol[] = [];
      
      const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          symbols.push(this.createSymbol(node.name.text, "function", node, sourceFile, filePath));
        } else if (ts.isClassDeclaration(node) && node.name) {
          symbols.push(this.createSymbol(node.name.text, "class", node, sourceFile, filePath));
        } else if (ts.isInterfaceDeclaration(node)) {
          symbols.push(this.createSymbol(node.name.text, "interface", node, sourceFile, filePath));
        } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
          symbols.push(this.createSymbol(node.name.text, "method", node, sourceFile, filePath));
        } else if (ts.isVariableStatement(node)) {
          const isExported = node.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
          if (isExported) {
            node.declarationList.declarations.forEach((d: any) => {
              if (ts.isIdentifier(d.name)) {
                symbols.push(this.createSymbol(d.name.text, "variable", d, sourceFile, filePath));
              }
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
      const relativePath = path.relative(process.cwd(), filePath);
      this.symbolIndex.set(relativePath, symbols);
      this.saveRegistry();
    } catch (err) {
      logger.error({ err, filePath }, "[SemanticMap] Failed to index file");
    }
  }

  private removeFileFromIndex(filePath: string) {
    const relativePath = path.relative(process.cwd(), filePath);
    if (this.symbolIndex.has(relativePath)) {
      this.symbolIndex.delete(relativePath);
      logger.info(`[SemanticMap] Removed file from registry: ${relativePath}`);
      this.saveRegistry();
    }
  }

  private createSymbol(name: string, kind: string, node: ts.Node, sourceFile: ts.SourceFile, filePath: string): CodeSymbol {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return {
      name,
      kind,
      line: line + 1,
      filePath: path.relative(process.cwd(), filePath),
    };
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
