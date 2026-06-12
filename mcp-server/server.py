import os
import shutil
from typing import Dict, Any, List
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP Server for the Desktop Mount Layer
mcp = FastMCP("RemoteDesktopMountLayer")

active_mounts: Dict[str, str] = {}
temp_queues: List[Dict[str, Any]] = []

@mcp.tool()
def mount_remote_target(desktop_path: str) -> str:
    """Configures the server's local storage path pointer."""
    abs_path = os.path.abspath(desktop_path)
    if not os.path.exists(abs_path):
        os.makedirs(abs_path, exist_ok=True)
    mount_id = f"mount_{len(active_mounts)}"
    active_mounts[mount_id] = abs_path
    
    return f"Successfully mounted {abs_path} as {mount_id}"

@mcp.tool()
def get_mount_status() -> Dict[str, Any]:
    """Returns active system health, disk space, and paths."""
    status = {
        "active_imports": len(active_mounts),
        "mounts": active_mounts,
        "health": "ONLINE",
        "pending_deltas": len(temp_queues)
    }
    try:
        total, used, free = shutil.disk_usage("/")
        status["disk_space"] = {
            "total_gb": round(total / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2)
        }
    except Exception:
        pass
    
    return status

@mcp.tool()
def sync_delta_buffer() -> str:
    """Safely drains/flushes transient file queues."""
    flushed = len(temp_queues)
    temp_queues.clear()
    return f"Flushed {flushed} pending deltas from the transient buffer."

if __name__ == "__main__":
    mcp.run()
