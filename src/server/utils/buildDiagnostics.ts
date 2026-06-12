// File: src/server/utils/buildDiagnostics.ts

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { telemetryService } from "../services/TelemetryService.js";
import { log } from "../observability/Logger.js";

export async function handleFailedBuild(
  buildText: string,
  socket: any,
  configData?: { openRouterKey?: string; modelName?: string }
) {
  try {
    const rawKey = configData?.openRouterKey;
    const actualKey = (rawKey && rawKey !== "default-system-key" && rawKey !== "placeholder")
      ? rawKey
      : (process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);

    if (!actualKey) {
      log.warn("Diagnostics", "No API key available for automatic failed build analysis.");
      return;
    }

    const isGeminiKey = actualKey.startsWith("AIzaSy") || !actualKey.startsWith("sk-");
    let modelName = configData?.modelName || (isGeminiKey ? "google/gemma-4-31b-it" : "google/gemma-4-31b-it");

    log.info("Diagnostics", `Running compilation failure analysis using model: ${modelName}`);

    const llm = new ChatOpenAI({
      apiKey: actualKey,
      configuration: {
        baseURL: isGeminiKey ? "https://generativelanguage.googleapis.com/v1beta/openai/" : "https://openrouter.ai/api/v1",
      },
      modelName,
      temperature: 0,
    });

    const prompt = `
You are the COMPILER & BUILD HARNESS DIAGNOSTICIAN.
The application workspace build failed. Here are the last few lines of raw bundler/compiler logs:

\`\`\`
${buildText}
\`\`\`

Analyze the build failure and generate a concise engineering lesson learned.
Identify the files involved, the core error patterns or compiler warnings, and clear corrective remedies.

You must output ONLY a valid JSON object matching this schema (with no extra markdown or chat intro/outro, directly return the JSON):
{
  "category": "Compiler",
  "errorPattern": "A concise substring of the key compiler error text (e.g. 'Failed compilation syntax audit' or 'TS2304: Cannot find name')",
  "discoveredConstraint": "A high-level explanation of why this error happens and the underlying system constraint",
  "remedialAction": "Practical, bullet-by-bullet guide on how a coder can fix this error"
}
`;

    const response = await llm.invoke([new SystemMessage(prompt)]);
    const content = response.content.toString();
    const matches = content.match(/\{[\s\S]*\}/);
    if (matches) {
      const parsed = JSON.parse(matches[0]);
      
      const lessonLearned = {
        category: parsed.category || "Compiler",
        errorPattern: parsed.errorPattern || "Build failure",
        discoveredConstraint: parsed.discoveredConstraint || "An error occurred during build compilation.",
        remedialAction: parsed.remedialAction || "Check the compiler logs and fix syntax errors.",
      };

      log.info("Diagnostics", `Successfully crystallized a new lesson: ${lessonLearned.errorPattern}`);

      // Log to server telemetry registry memory
      try {
        const telemetryLesson = {
          id: `lesson_comp_${Math.floor(Math.random() * 1000000)}`,
          timestamp: Date.now(),
          toolName: "shell_exec",
          failingInput: { command: "npm run build" },
          errorSnippet: lessonLearned.errorPattern,
          successfulInput: {},
          resolutionApproach: lessonLearned.remedialAction,
          fileAffected: "Compiler"
        };
        telemetryService.getLessonsData().unshift(telemetryLesson);
        telemetryService.saveLessons();
      } catch (err) {
        log.warn("Diagnostics", "Failed to append lesson to telemetry service store");
      }

      // Fire WebSocket message to client to automatically persist into browser client-side SQLite WASM database
      socket.emit("compiler_lesson_formed", lessonLearned);
    }
  } catch (err: any) {
    log.error("Diagnostics", `Failed to execute build diagnostics helper: ${err.message}`);
  }
}
