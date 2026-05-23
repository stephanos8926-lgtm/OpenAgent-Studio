import { Router } from "express";
import crypto from "crypto";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { InMemoryVFS } from "../services/vfs/index.js";
import { createSwarmGraph } from "../agents/SwarmGraph.js";
import { PlatformAgent } from "../agents/PlatformAgent.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/error.js";
import { spawn } from "child_process";
import { SuperOS } from "../../../.super/runtime/superctl.js";
import { sharedCheckpointer } from "../agents/AgentFactory.js";

const apiRouter = Router();

// Lazy instance retrieval and auto-boot hook
async function getSuperOS() {
  const os = await SuperOS.getInstance();
  if (os.kernel.getSystemState() === 'HALTED') {
    await os.powerOn();
  }
  return os;
}


apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

apiRouter.post("/chat", async (req, res, next) => {
  try {
    const { messages, vfs, openRouterKey, modelName, threadId, executionMode } = req.body;

    if (!openRouterKey) {
      throw new AppError("OpenRouter API Key is required.", 400, "MISSING_KEY");
    }

    const vfsInstance = new InMemoryVFS(vfs);
    
    // Map existing UI messages into LangChain format and assign IDs explicitly
    const mappedMessages = messages.map((m: any) => {
      let msg;
      if (m.role === 'user') msg = new HumanMessage(m.content);
      else if (m.role === 'system') msg = new SystemMessage(m.content);
      else msg = new AIMessage(m.content);
      msg.id = m.id || crypto.randomUUID();
      return msg;
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Creates the deep agent graph using the factory
    const agent = createSwarmGraph(vfsInstance, openRouterKey);

    const activeThreadId = threadId || crypto.randomUUID();
    const config = { configurable: { thread_id: activeThreadId, execution_mode: executionMode || 'normal' } };

    // Load state from SQL persistent checkpointer to deduplicate messages and allow compression removal
    const currentState = await agent.getState(config);
    const existingMessages = currentState?.values?.messages as BaseMessage[] | undefined;

    let newMessagesToPass: BaseMessage[] = [];

    if (existingMessages && existingMessages.length > 0) {
      const lastStored = existingMessages[existingMessages.length - 1];
      const lastStoredType = lastStored._getType();
      const lastStoredContent = lastStored.content.toString().trim();

      // Find the last stored message's index in the frontend mapped list
      let matchIdx = -1;
      for (let i = mappedMessages.length - 1; i >= 0; i--) {
        const m = mappedMessages[i];
        if (m._getType() === lastStoredType && m.content.toString().trim() === lastStoredContent) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx !== -1) {
        newMessagesToPass = mappedMessages.slice(matchIdx + 1);
      } else {
        // Fallback to passing the last message only
        newMessagesToPass = mappedMessages.slice(-1);
      }
    } else {
      newMessagesToPass = mappedMessages;
    }

    // Inspect and inject system reminders about recent failed tool calls
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const failuresPath = path.join(process.cwd(), ".data", "tool_failures.json");
      const raw = await fs.readFile(failuresPath, "utf-8").catch(() => "");
      if (raw) {
        const logs = JSON.parse(raw);
        if (Array.isArray(logs) && logs.length > 0) {
          const recentLogs = logs.slice(-2);
          let reminderText = `\n\n⚠️ SYSTEM HEALTH REMINDER:\nRecent tool failures detected. Verify target blocks and parameters:\n`;
          recentLogs.forEach((l, idx) => {
            reminderText += `- Error in tool '${l.toolName}': "${l.error}" (Failure ID: ${l.id})\n`;
          });
          reminderText += `IMPORTANT: You can query the 'tool_search' tool with the Failure ID (e.g. tool_search({ failureId: "${recentLogs[recentLogs.length - 1].id}" })) to receive context-specific repair hints, precise canonical usage patterns, and helpful tips.\n`;
          newMessagesToPass.push(new SystemMessage(reminderText));
        }
      }
    } catch (e) {
      // ignore
    }

    // Platform Health Check (Service Layer)
    const platformAgent = new PlatformAgent(openRouterKey);
    const health = await platformAgent.runHealthCheck({ 
        messageCount: mappedMessages.length,
        vfsSize: Object.keys(vfs).length
    });

    if (health.repair_needed) {
       res.write(`data: ${JSON.stringify({ type: 'platform', content: `[Platform Architect] Self-repairing: ${health.actions.join(', ')}` })}\n\n`);
    }

    const stream = await agent.streamEvents(
      { messages: newMessagesToPass }, 
      { version: "v2", configurable: config.configurable }
    );

    for await (const event of stream) {
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data.chunk?.content;
        if (chunk && typeof chunk === "string") {
          res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
        }
      } else if (event.event === "on_tool_end") {
        const currentVfs = await vfsInstance.getFiles();
        res.write(`data: ${JSON.stringify({ type: 'tool', name: event.name, output: event.data.output, input: event.data.input, vfs: currentVfs })}\n\n`);
      } else if (event.event === "on_custom_event" && event.name === "terminal_output") {
        res.write(`data: ${JSON.stringify({ type: 'pty', content: event.data.chunk })}\n\n`);
      } else if (event.event === "on_custom_event" && event.name === "proposed_change") {
        res.write(`data: ${JSON.stringify({ type: 'proposal', ...event.data })}\n\n`);
      } else if (event.event === "on_custom_event" && event.name === "proposed_command") {
        res.write(`data: ${JSON.stringify({ type: 'proposed_command', ...event.data })}\n\n`);
      } else if (event.event === "on_chain_start" && event.name === "orchestrator") {
        res.write(`data: ${JSON.stringify({ type: 'swarm', activeAgent: 'orchestrator' })}\n\n`);
      } else if (event.event === "on_chain_start" && event.name === "planner") {
        res.write(`data: ${JSON.stringify({ type: 'swarm', activeAgent: 'planner' })}\n\n`);
      } else if (event.event === "on_chain_start" && event.name === "coder") {
        res.write(`data: ${JSON.stringify({ type: 'swarm', activeAgent: 'coder' })}\n\n`);
      } else if (event.event === "on_chain_start" && event.name === "auditor") {
        res.write(`data: ${JSON.stringify({ type: 'swarm', activeAgent: 'auditor' })}\n\n`);
      } else if (event.event === "on_chain_end" && event.name === "planner") {
        if (event.data.output && event.data.output.task_dag) {
           res.write(`data: ${JSON.stringify({ type: 'swarm', tasks: event.data.output.task_dag })}\n\n`);
        }
      } else if (event.event === "on_chain_end" && event.name === "auditor") {
        if (event.data.output && event.data.output.environment_health) {
           res.write(`data: ${JSON.stringify({ type: 'swarm', health: event.data.output.environment_health })}\n\n`);
        }
      }
    }
    
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err: any) {
    logger.error({ err }, "Error in SSE stream");
    // Only send the error back to the client if headers are not already sent.
    // In SSE, if headers are sent we can stream a synthetic error event
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Server error' })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

apiRouter.post("/approve-command", async (req, res, next) => {
  try {
    const { id, approved } = req.body;
    const { commandApprovalService } = await import("../services/CommandApprovalService.js");
    const success = commandApprovalService.resolveApproval(id, approved);
    res.json({ success });
  } catch (err) {
    next(err);
  }
});

apiRouter.post("/terminal/command", async (req, res, next) => {
  try {
    const { command, cwd } = req.body;
    if (!command) {
      throw new AppError("Command is required.", 400, "BAD_REQUEST");
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const execCwd = cwd || process.cwd();
    const child = spawn(command, {
      cwd: execCwd,
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1'
      }
    });

    child.stdout.on("data", (data) => {
      res.write(data);
    });

    child.stderr.on("data", (data) => {
      res.write(data);
    });

    child.on("close", (code) => {
      res.write(`\r\n[Process completed with exit code ${code}]\r\n`);
      res.end();
    });

    child.on("error", (err) => {
      res.write(`\r\n[Process error: ${err.message}]\r\n`);
      res.end();
    });
  } catch (err: any) {
    next(err);
  }
});

apiRouter.post("/save", async (req, res, next) => {
  try {
    const { vfs } = req.body;
    if (!vfs || typeof vfs !== 'object') {
      throw new AppError("VFS object is required.", 400, "BAD_REQUEST");
    }

    const fs = await import('fs/promises');
    const path = await import('path');
    const basePath = process.cwd(); // Assume CWD is workspace root

    // Save all files to CWD
    for (const [filePath, content] of Object.entries(vfs)) {
      const fullPath = path.join(basePath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content as string, 'utf8');
    }

    res.json({ success: true, message: "Workspace files saved to host disk." });
  } catch (err: any) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════
// SUPEROS HYPERVISOR METRIC & COMPILER CHANNELS
// ═══════════════════════════════════════════════════════════

apiRouter.get("/superos/status", async (req, res, next) => {
  try {
    const os = await getSuperOS();
    res.json({
      status: "ok",
      state: os.kernel.getSystemState(),
      runlevel: os.kernel.getRunlevel(),
      pids: os.processManager.getActivePids(),
      cronJobsCount: os.cronDaemon.getJobs().length
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post("/superos/power", async (req, res, next) => {
  try {
    const { action } = req.body; // 'on' | 'off' | 'reboot'
    const os = await getSuperOS();
    
    if (action === 'on') {
      await os.powerOn();
    } else if (action === 'off') {
      await os.powerOff();
    } else if (action === 'reboot') {
      await os.reboot();
    } else {
      throw new AppError("Invalid action code. Supported actions are: 'on', 'off', 'reboot'.", 400, "BAD_REQUEST");
    }
    
    res.json({ success: true, state: os.kernel.getSystemState() });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/processes", async (req, res, next) => {
  try {
    const os = await getSuperOS();
    res.json({
      success: true,
      processes: os.processManager.getProcessList()
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post("/superos/execute-asm", async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      throw new AppError("Assembly execution script string is required.", 400, "BAD_REQUEST");
    }
    const os = await getSuperOS();
    const result = await os.executeAssembly(code);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/vfs/ls", async (req, res, next) => {
  try {
    const cleanPath = String(req.query.path || '/');
    const os = await getSuperOS();
    const exists = await os.vfs.exists(cleanPath);
    if (!exists) {
      throw new AppError(`Path directory '${cleanPath}' does not exist inside VFS namespaces.`, 404, "NOT_FOUND");
    }
    const entries = await os.vfs.readdir(cleanPath);
    res.json({ success: true, path: cleanPath, entries });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/vfs/cat", async (req, res, next) => {
  try {
    const cleanPath = String(req.query.path);
    if (!cleanPath) {
      throw new AppError("VFile path query parameter is mandatory.", 400, "BAD_REQUEST");
    }
    const os = await getSuperOS();
    const exists = await os.vfs.exists(cleanPath);
    if (!exists) {
      throw new AppError(`Target virtual file '${cleanPath}' cannot be found.`, 404, "NOT_FOUND");
    }
    const content = await os.vfs.readFile(cleanPath);
    res.json({ success: true, path: cleanPath, content });
  } catch (err) {
    next(err);
  }
});

apiRouter.post("/superos/vfs/write", async (req, res, next) => {
  try {
    const { path: vPath, content } = req.body;
    if (!vPath || content === undefined) {
      throw new AppError("vPath and string content payload matches are mandatory.", 400, "BAD_REQUEST");
    }
    const os = await getSuperOS();
    await os.vfs.writeFile(vPath, content);
    res.json({ success: true, message: `Successfully committed ${Buffer.byteLength(content)} bytes to virtual node '${vPath}'` });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/logs", async (req, res, next) => {
  try {
    const stream = String(req.query.log || 'syslog');
    if (stream !== 'syslog' && stream !== 'boot.log' && stream !== 'cron.log') {
      throw new AppError("Invalid log stream query parameter. Supported values: 'syslog', 'boot.log', 'cron.log'", 400, "BAD_REQUEST");
    }
    const os = await getSuperOS();
    const lines = os.readLogFile(stream, 80);
    res.json({ success: true, stream, lines });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/db/boot-history", async (req, res, next) => {
  try {
    const os = await getSuperOS();
    const logs = await os.queryBootHistory();
    res.json({ success: true, history: logs });
  } catch (err) {
    next(err);
  }
});

apiRouter.get("/superos/db/cron-history", async (req, res, next) => {
  try {
    const os = await getSuperOS();
    const logs = await os.querySchedulerLogs();
    res.json({ success: true, history: logs });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════
// SWARM CHECKPOINT HISTORY & REVERT ENDPOINTS
// ═══════════════════════════════════════════════════════════

apiRouter.get("/swarm/history", async (req, res, next) => {
  try {
    const threadId = String(req.query.threadId);
    if (!threadId || threadId === "null" || threadId === "undefined") {
      return res.json({ success: true, history: [] });
    }

    const checkpoints = [];
    const config = { configurable: { thread_id: threadId } };
    
    const generator = sharedCheckpointer.list(config);
    for await (const tuple of generator) {
      checkpoints.push({
        threadId: tuple.config.configurable?.thread_id,
        checkpointId: tuple.config.configurable?.checkpoint_id,
        parentCheckpointId: tuple.parentConfig?.configurable?.checkpoint_id,
        timestamp: tuple.checkpoint?.ts || new Date().toISOString(),
        metadata: tuple.metadata || {},
      });
    }

    res.json({ success: true, history: checkpoints });
  } catch (err: any) {
    next(err);
  }
});

apiRouter.post("/swarm/revert", async (req, res, next) => {
  try {
    const { threadId, checkpointId } = req.body;
    if (!threadId || !checkpointId) {
      throw new AppError("threadId and checkpointId are required in body payload.", 400, "BAD_REQUEST");
    }

    const tuple = await sharedCheckpointer.getTuple({
      configurable: { thread_id: threadId, checkpoint_id: checkpointId }
    });

    if (!tuple) {
      throw new AppError(`Checkpoint with ID '${checkpointId}' does not exist for thread '${threadId}'.`, 404, "NOT_FOUND");
    }

    // Clone the configuration list and write a brand new head checkpoint repeating that exact schema
    const newConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: tuple.config.configurable?.checkpoint_ns || "",
        checkpoint_id: crypto.randomUUID()
      }
    };

    await sharedCheckpointer.put(newConfig, tuple.checkpoint, {
      ...tuple.metadata,
      reverted_from: checkpointId,
      revert_timestamp: new Date().toISOString()
    } as any);

    res.json({ 
      success: true, 
      message: `Successfully restored thread '${threadId}' state back to '${checkpointId}'`,
      checkpointId: newConfig.configurable.checkpoint_id
    });
  } catch (err: any) {
    next(err);
  }
});


export default apiRouter;
