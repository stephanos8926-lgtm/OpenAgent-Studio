# ADR: Interactive Bidirectional Terminal (Piped)

## Context
Full native PTY support requires compiling `node-pty`, which fails in our restricted build environment due to missing native build tools (`make`/`gyp`). 

## Decision
We will utilize an enhanced piping strategy with `child_process.spawn` to simulate an interactive terminal. While this lacks true PTY capabilities (e.g., handling complex terminal resizing, ANSI escape sequences perfectly), it provides sufficient bidirectional communication for standard shell task execution.

## Consequences
- **Positive:**
  - Works within existing environment constraints.
  - No native binary dependency management risks.
- **Negative:**
  - Lacks advanced TTY handling (e.g., `curses` applications or complex interactive prompts will not render correctly).
  - Terminal resizing and prompt interactions might be fragile.
