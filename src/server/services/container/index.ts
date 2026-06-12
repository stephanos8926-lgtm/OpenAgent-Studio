import { IContainer } from "./interface.js";
import { HostContainer } from "./HostContainer.js";
import { VfsManager, VfsConfig } from "../vfs/VfsManager.js";
import path from "path";

// Provide clear separation of interests: only allow filesystem root access in explicit dev mode.
const isDevelopment = process.env.NODE_ENV !== "production";
const isDeveloperMode = process.env.DEVELOPER_MODE === "true";

let backendMode: 'host' | 'memory' = 'host';
let basePath = path.join(process.cwd(), ".workspaces", "default");

if (isDevelopment && isDeveloperMode) {
  basePath = process.cwd();
}

const config: VfsConfig = {
  backend: backendMode,
  basePath: basePath,
  failoverPolicy: 'flush'
};

import { log } from "../../observability/Logger.js";

const vfsManager = new VfsManager(config);
// We fire and forget initialization but usually we'd wait. We'll rely on it starting up async.
vfsManager.initialize().catch(err => log.error('ContainerService', 'Failed to initialize VfsManager', { err }));

// Instantiate default HostContainer
export const containerService: IContainer = new HostContainer(vfsManager);

// Re-export common types
export * from "./interface.js";
export * from "./HostContainer.js";
export * from "./WebContainer.js";
