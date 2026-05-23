import * as ts from "typescript";

export interface SemanticSymbol {
  name: string;
  kind: string;
  line: number;
  snippet: string;
}

export function getSemanticMap(code: string, fileName: string): SemanticSymbol[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const symbols: SemanticSymbol[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: "Function",
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        snippet: node.getText().substring(0, 100).replace(/\n/g, ' ') + "..."
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.text,
        kind: "Class",
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        snippet: node.getText().substring(0, 100).replace(/\n/g, ' ') + "..."
      });
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
        symbols.push({
          name: node.name.text,
          kind: "Interface",
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          snippet: node.getText().substring(0, 100).replace(/\n/g, ' ') + "..."
        });
    } else if (ts.isExportDeclaration(node) || ts.isVariableStatement(node)) {
        // Handle exported variables or constants
        if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            node.declarationList.declarations.forEach(decl => {
                if (ts.isIdentifier(decl.name)) {
                    symbols.push({
                        name: decl.name.text,
                        kind: "ExportedVariable",
                        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                        snippet: node.getText().substring(0, 100).replace(/\n/g, ' ') + "..."
                    });
                }
            });
        }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}
