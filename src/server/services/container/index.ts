import { IContainer } from "./interface.js";
import { HostContainer } from "./HostContainer.js";
import { HostVFS } from "../vfs/index.js";
import path from "path";

// Instantiate HostVFS bound to an isolated workspace directory to separate it from IDE core source code
const hostVfs = new HostVFS(path.join(process.cwd(), "workspace"));

// Instantiate default HostContainer
export const containerService: IContainer = new HostContainer(hostVfs);

// Re-export common types
export * from "./interface.js";
export * from "./HostContainer.js";
export * from "./WebContainer.js";
