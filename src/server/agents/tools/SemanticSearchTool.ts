import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { semanticMapService } from "../../services/SemanticMapService.js";

/**
 * Tool for searching code symbols (functions, classes, methods) in the workspace.
 * Helps reduce token usage by allowing targeted symbol lookups.
 */
export const semanticSearchTool = tool(
  async ({ query }) => {
    try {
      const results = semanticMapService.query(query);
      if (results.length === 0) {
        return `No symbols found for "${query}". Try a broader term.`;
      }

      return JSON.stringify(results, null, 2);
    } catch (error: any) {
      return `Error performing semantic search: ${error.message}`;
    }
  },
  {
    name: "semantic_search",
    description: "Search for functions, classes, and interfaces by name across the entire workspace. Returns symbol metadata including file path and line number.",
    schema: z.object({
      query: z.string().describe("The name or partial name of the code symbol to search for.")
    }),
  }
);
