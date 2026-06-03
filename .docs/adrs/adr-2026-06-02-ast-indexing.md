# ADR: Background AST Indexing & Semantic Retrieval

## Context
As the workspace grows in size, passing the entire filesystem content or relying on `grep` for context-seeding often exceeds model token limits or returns irrelevant code snippets. We need a way for agents to "know" the structure, signatures, and internal object relationships of the codebase without needing to ingest every file in the context window.

## Decision
We will implement an automated, high-performance AST indexing daemon utilizing `tree-sitter`.
This service will run in the background (as `SemanticMapService.ts`) and maintain an incremental index of all TypeScript symbols in the workspace, persisting to `.data/symbol_index.json`. 

Agents will leverage a new `get_semantic_map` tool that queries this index to retrieve function signatures, class members, and usage patterns, allowing for precise context seeding.

## Consequences
- **Positive:**
  - Dramatically improves context quality for large codebases.
  - Allows agents to reason about codebase structure without reading whole files.
  - Significantly reduces token usage for context-seed tool calls.
- **Negative:**
  - Background indexing daemon consumes CPU cycles.
  - Index must be kept synchronized with rapid code changes (currently handled via `chokidar` changes).
  - Needs robust handling for `tree-sitter` parsing errors on broken code.

## Alternatives Rejected
1. **Full Repo Embeddings (Vector Search):** Excessive overhead. A file-based symbol index is more structured, faster, and sufficient for agent reasoning.
2. **LLM Reparse Everything:** Impractical. Too slow, inconsistent context, and incredibly expensive in production.
3. **Regex-based indexing:** Vulnerable to code formatting differences (e.g., whitespace), comments, and complex TypeScript syntax. AST parsing is far more reliable.
