import "express-async-errors";
import cors from "cors";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";

import { logger } from "./src/server/utils/logger.js";
import { requestLogger } from "./src/server/middleware/requestLogger.js";
import { errorHandler } from "./src/server/middleware/error.js";
import { InMemoryVFS } from "./src/server/services/vfs/index.js";
import { createTools } from "./src/server/agents/tools/index.js";
import { loadConfig, getConfig } from "./src/server/config/index.js";

import apiRouter from "./src/server/routes/api.js";

import { scheduler } from "./src/server/services/SchedulerService.js";

async function startServer() {
  await loadConfig();
  const config = getConfig();

  // Initialize persistence layer
  const { persistenceService } = await import("./src/server/services/PersistenceService.js");
  await persistenceService.init();

  // Initialize semantic code map
  const { semanticMapService } = await import("./src/server/services/SemanticMapService.js");
  semanticMapService.startIndexing();
  
  // Initialize scheduler background tasks
  await scheduler.init();

  const app = express();
  const PORT = config.server.port;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(requestLogger);

  app.use("/api", apiRouter);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(errorHandler);

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
