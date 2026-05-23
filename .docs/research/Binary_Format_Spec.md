# SuperOS Binary Executable Format Specification (SOS-64)
**Identifier**: `SUPERBIN` | `SOS-64`
**Class**: 64-bit Register-based Virtual Architecture Specification
**Prepared by**: FORGE (Principal Systems Architect)
**Status**: APPROVED SPECIFICATION

---

## 1. Specification Overview
The **SOS-64** (`.superbin`) specification defines a portable, lightweight, record-exact binary executable and object-file format designed to run with total deterministic isolation within the SuperOS Virtual Machine. This specification includes:
1. File Header structures and Magic numbers.
2. The Virtual Instruction Set Architecture (ISA).
3. The ELF-to-SOS Binary Translation Pipeline.
4. The C Compiler / Assembly pipeline design.

---

## 2. Binary File Layout Structure

Every `.superbin` executable is represented as a contiguous byte array divided into four functional sections:

```
┌────────────────────────────────────────────────────────┐
│             SOS-64 FILE HEADER (64 Bytes)             │
│   Magic Number | Entry Point | Section Offsets         │
├────────────────────────────────────────────────────────┤
│          .text SECTION (Executable Bytecode)           │
│   Instruction stream mapped at execution memory        │
├────────────────────────────────────────────────────────┤
│          .data SECTION (Initialized Globals)           │
│   Static variables, string literals, raw bytes        │
├────────────────────────────────────────────────────────┤
│           .symtab SECTION (Symbol Registry)           │
│   Symbol offsets for debugging and linking             │
└────────────────────────────────────────────────────────┘
```

### 2.1 File Header Structural Definition (Offset / Size Table)
The header resides at the absolute zero-offset of the file, structured exactly as follows (little-endian byte alignment):

| Offset (Bytes) | Size (Bytes) | Field Name | Description |
| :--- | :--- | :--- | :--- |
| `0x00` | 4 | `magic` | Identifier bytes: `0x7F 'S' 'O' 'S'` (`[0x7F, 0x53, 0x4F, 0x53]`) |
| `0x04` | 1 | `class` | File class: `0x01` = 32-bit, `0x02` = 64-bit |
| `0x05` | 1 | `endian` | Endianness: `0x01` = Little Endian, `0x02` = Big Endian |
| `0x06` | 2 | `flags` | Reserved architecture runtime flags |
| `0x08` | 8 | `entry_point` | 64-bit virtual address where execution begins |
| `0x10` | 8 | `text_offset` | Absolute file offset of the `.text` segment start |
| `0x18` | 8 | `text_size` | Length of the `.text` segment in bytes |
| `0x20` | 8 | `data_offset` | Absolute file offset of the `.data` segment start |
| `0x28` | 8 | `data_size` | Length of the `.data` segment in bytes |
| `0x30` | 8 | `sym_offset` | Absolute file offset of the `.symtab` segment start |
| `0x38` | 8 | `sym_size` | Length of the `.symtab` segment in bytes |

---

## 3. Instruction Set Architecture (ISA)

The SOS-64 virtual CPU registers and instruction definitions are defined to handle arithmetic, control-flow jump structures, logic, and IO traps.

### 3.1 Register Model
VM execution utilizes 16 general-purpose 64-bit registers, and 3 control registers:

*   `R0` - `R11`: Standard registers for calculation, variable offsets, and temporaries.
*   `R12` - `R13`: Argument-passing registers (for calling conventions).
*   `R14`: Stack Frame Pointer (`FP`).
*   `R15`: Return Value register (`RV`).
*   `PC`: Program Counter (Holds virtual memory address of the next instruction).
*   `SP`: Stack Pointer (Memory offset of current stack top).
*   `FLAGS`: State/Condition registers (Zero-flag `Z`, Negative-flag `N`, Overflow-flag `O`).

### 3.2 Opcode Layout (32-bit Words)
Every instruction in the `.text` block is a fixed-width 32-bit word matching this schema:

```
┌───────────────┬───────────────┬───────────────┬────────────────────────┐
│  OPCODE (8b)  │  DST_REG (5b) │  SRC_REG (5b) │   IMMEDIATE / ADDR(14b)│
└───────────────┴───────────────┴───────────────┴────────────────────────┘
```

#### Selection Opcodes definition:

| Hex Opcode | Mnemonic | Format | Semantics / Action |
| :--- | :--- | :--- | :--- |
| `0x00` | `NOP` | `NOP` | Do nothing for 1 instruction cycle. |
| `0x01` | `MOV` | `MOV Rd, Rs` | Move contents of `Rs` register directly into `Rd`. |
| `0x02` | `MOVI` | `MOVI Rd, Imm`| Move 14-bit immediate `Imm` directly into `Rd`. |
| `0x10` | `ADD` | `ADD Rd, Rs` | `Rd = Rd + Rs`. Update `FLAGS`. |
| `0x11` | `SUB` | `SUB Rd, Rs` | `Rd = Rd - Rs`. Update `FLAGS`. |
| `0x20` | `LDB` | `LDB Rd, [Rs+Offset]` | Load absolute byte from memory address into `Rd`. |
| `0x21` | `STB` | `STB Rs, [Rd+Offset]` | Store least significant byte of `Rs` to target memory. |
| `0x30` | `JMP` | `JMP Offset` | Unconditional relative jump: `PC = PC + Offset`. |
| `0x31` | `JZ` | `JZ Offset` | Conditional relative jump: Jumps if Zero Flag `Z == 1`. |
| `0x32` | `JNZ` | `JNZ Offset` | Conditional relative jump: Jumps if Zero Flag `Z == 0`. |
| `0x40` | `CALL` | `CALL Offset`| Push current `PC` to stack; jump execution to PC target. |
| `0x41` | `RET` | `RET` | Pop return address from stack; write into `PC`. |
| `0x50` | `TRAP` | `TRAP Code` | Hardware-interrupt trigger. Code `0x01` prints string, `0x02` terminates. |

---

## 4. The `elf2sos` ELF Translation Pipeline

Converting pre-compiled Linux x86/x86_64 ELF executables to `SOS-64` requires an intermediate binary translation tool called `elf2sos`. This tool does not interpret at runtime; it performs static code conversion.

```
┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│   Linux standard   │      │ Static Disassembler│      │  Static IR / Basic │
│   64-bit ELF binary│ ───> │ (Objdump / Capstone│ ───> │  Block Analysis    │
└────────────────────┘      └────────────────────┘      └────────────────────┘
                                                                   │
                                                                   ▼
┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│    SOS-64 Target   │      │ Opcode Translation │      │ Register Mapping   │
│   .superbin file   │ <─── │ Loader Assembly    │ <─── │ (RAX, RBX -> R0,R1)│
└────────────────────┘      └────────────────────┘      └────────────────────┘
```

### 4.1 Register Mapping Rules for Assembly Translators
Standard 64-bit x86/x86_64 registers are statically paired with SOS-64 virtual targets:

*   `RAX` (Accumulator return value) ──> `R15` (`RV`)
*   `RDI` (First function block parameter) ──> `R12` (`Arg0`)
*   `RSI` (Second function block parameter) ──> `R13` (`Arg1`)
*   `RBP` (Base Pointer) ──> `R14` (`FP`)
*   `RSP` (Stack control) ──> `SP` (`StackPointer`)
*   `RBX`, `RCX`, `RDX`, `R8`-`R11` ──> `R0` through `R7`

### 4.2 System Call Translation
Standard Linux x86 interrupts (`syscall`, offset opcode `0x0F 0x05`) are redirected to the guest. For example:
*   `sys_write` (Linux Syscall `1` with `RDI = 1` stdout) is translated to `TRAP 0x01`.
*   `sys_exit` (Linux Syscall `60`) is translated mapped to `TRAP 0x02`.
*   Unsupported Linux system calls are compiled as safe stubs, logging warning hooks to our virtual console.

---

## 5. Basic C to SOS-64 compiler Pipeline

A minimal, host-driven C compiler can easily emit SOS-64 machine code by utilizing standard lexical-to-compiler structures.

```
Source Program   Token Flow          Abstract Syntax Tree    Generated Opcodes
┌─────────────┐  ┌─────────────┐     ┌──────────────────┐    ┌─────────────────┐
│ int x = 4;  │  │ [Keyword,   │     │      Assign      │    │ MOVI R0, 4      │
│  x = x + 2; │──│  Identifier,│───> │     /      \     │───>│ MOVI R1, 2      │
│             │  │  Operator...]│     │  Ident(x)  Add   │    │ ADD R0, R1      │
└─────────────┘  └─────────────┘     └──────────────────┘    └─────────────────┘
```

1.  **Lexical Analyzer (Lexer)**: Scans `.c` program streams and breaks text into tokens (`KW_INT`, `IDENT("x")`, `OP_ASSIGN`, `INT_LIT(4)`).
2.  **Syntax Analyzer (Parser)**: Combines tokens into an Abstract Syntax Tree (AST) using basic recursive descent parsing algorithms.
3.  **Intermediate Code Generator**: Builds dynamic linear arrays representing stack operations.
4.  **Code Generator (Emitter)**: Translates the structural code nodes into binary strings conforming exactly to the SOS-64 Opcode Table, then constructs the magic section headers to compile the final executable output.
