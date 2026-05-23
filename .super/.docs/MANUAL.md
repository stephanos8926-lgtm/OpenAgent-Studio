# SuperOS System Administration & Architectural Manual (v1.0.0-LTS)

## 1. Directory Structure Blueprint
All subsystems are organized inside the standard path root `/.super/`:
*   `/.super/bin/`: CLI management interfaces (e.g. dynamic compiled binaries or utilities)
*   `/.super/config/`: Initial environmental profiles and crontab declarations
*   `/.super/data/`: Central transactional SQLite WAL databases and snapshot file memories
*   `/.super/logs/`: Raw rotated streaming text system file logs (syslog, boot logs, cron logs)
*   `/.super/runtime/`: The Core simulated operating system kernel files, VM engines, and adapters
*   `/.super/hypervisor/`: Master virtualization controllers and diagnostic modules
*   `/.super/project/`: Sandboxed virtual storage directory mapped inside virtual mount points
*   `/.super/documents/`: General administrative guides and setup papers

---

## 2. Instruction Set Architecture (ISA) Details
Our virtual stack CPU handles 4 primary registers (R1, R2, R3, R4) using standard instructions:
*   `LOAD Rx Constant` -> Set specified value directly inside Register Rx (0..3)
*   `LDM Rx Addr` -> Read value from memory address `Addr` and save to Register Rx
*   `STM Rx Addr` -> Write value from Register Rx into specified memory index `Addr`
*   `ADD Rx Ry` -> Perform math summation (`Rx = Rx + Ry`)
*   `SUB Rx Ry` -> Perform math subtraction (`Rx = Rx - Ry`)
*   `JMP target` -> Transfer execution controls (Program Counter) to target label or instruction pointer index
*   `JZ Rx target` -> Conditional jump to target if register Rx holds a value of 0
*   `PRINT Rx` -> Output Register contents to stdout streams
*   `PUSH Rx` -> Push Register value onto VM stack
*   `POP Rx` -> Pop top value of VM stack into Register Rx
*   `HALT` -> Gracefully terminate operational execution cycles

---

## 3. Runlevel Schema Matrix
*   **Runlevel 0 (Halt)**: Triggers immediate graceful termination of all active process nodes. Destroys the virtual `/proc` tables and unmounts the VFS layers cleanly.
*   **Runlevel 1 (Single-User Maintenance)**: Pauses background schedulers and cron loops. System operations are limited to direct administrative single-queue commands.
*   **Runlevel 3 (Standard Multi-User CLI)**: Standard operational running state. Launches network configs, exposes active `/proc` channels, mounts filesystems, and activates the scheduler Cron Daemons.
*   **Runlevel 6 (Reboot)**: Initiates system-wide shutdown procedure followed immediately by a clean bootloader pipeline sequence targeting standard Runlevel 3.
