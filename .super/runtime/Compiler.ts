import { Opcode, Instruction } from './VM.js';

/**
 * SuperOS Compiler: Lexer, Parser, and Linker
 * Translates human-readable assembly lines into VM bytecode arrays
 */
export class SuperCompiler {
  
  /**
   * Compiles an assembly program string into a target instruction set
   */
  public static compile(source: string): Instruction[] {
    const lines = source.split('\n');
    const labelTable: Record<string, number> = {};
    const processedLines: string[] = [];
    
    // Pass 1: Lexical filtering and Label offset scanning
    let instructionPtr = 0;
    for (let line of lines) {
      // Striking out comments and whitespace
      const commentIdx = line.indexOf(';');
      if (commentIdx !== -1) {
        line = line.substring(0, commentIdx);
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Scanning labels ending in colon (e.g. "loop:")
      if (trimmed.endsWith(':')) {
        const labelName = trimmed.slice(0, -1).trim();
        if (labelTable[labelName] !== undefined) {
          throw new Error(`[Assemble Error] Duplicate label identifier registered: '${labelName}'`);
        }
        labelTable[labelName] = instructionPtr;
      } else {
        processedLines.push(trimmed);
        instructionPtr++;
      }
    }

    const compiledProgram: Instruction[] = [];

    // Pass 2: Parsing expressions and dynamic Linking
    for (let i = 0; i < processedLines.length; i++) {
      const line = processedLines[i];
      const parts = line.split(/\s+/);
      const opcodeStr = parts[0].toUpperCase();

      switch (opcodeStr) {
        case 'LOAD': {
          this.assertPartsCount(parts, 3, 'LOAD Rx Constant');
          const regIdx = this.parseRegister(parts[1]);
          const value = parseInt(parts[2], 10);
          compiledProgram.push({ op: Opcode.LOAD, arg1: regIdx, arg2: value });
          break;
        }
        case 'LDM': {
          this.assertPartsCount(parts, 3, 'LDM Rx Addr');
          const regIdx = this.parseRegister(parts[1]);
          const addr = parseInt(parts[2], 10);
          compiledProgram.push({ op: Opcode.LDM, arg1: regIdx, arg2: addr });
          break;
        }
        case 'STM': {
          this.assertPartsCount(parts, 3, 'STM Rx Addr');
          const regIdx = this.parseRegister(parts[1]);
          const addr = parseInt(parts[2], 10);
          compiledProgram.push({ op: Opcode.STM, arg1: regIdx, arg2: addr });
          break;
        }
        case 'ADD': {
          this.assertPartsCount(parts, 3, 'ADD Rx Ry');
          const rDst = this.parseRegister(parts[1]);
          const rSrc = this.parseRegister(parts[2]);
          compiledProgram.push({ op: Opcode.ADD, arg1: rDst, arg2: rSrc });
          break;
        }
        case 'SUB': {
          this.assertPartsCount(parts, 3, 'SUB Rx Ry');
          const rDst = this.parseRegister(parts[1]);
          const rSrc = this.parseRegister(parts[2]);
          compiledProgram.push({ op: Opcode.SUB, arg1: rDst, arg2: rSrc });
          break;
        }
        case 'JMP': {
          this.assertPartsCount(parts, 2, 'JMP [Label|Offset]');
          const target = parts[1];
          const offset = labelTable[target] !== undefined ? labelTable[target] : parseInt(target, 10);
          if (isNaN(offset)) {
            throw new Error(`[Linker Error] Unresolved jump target address pointer: '${target}'`);
          }
          compiledProgram.push({ op: Opcode.JMP, arg1: offset });
          break;
        }
        case 'JZ': {
          this.assertPartsCount(parts, 3, 'JZ Rx [Label|Offset]');
          const regIdx = this.parseRegister(parts[1]);
          const target = parts[2];
          const offset = labelTable[target] !== undefined ? labelTable[target] : parseInt(target, 10);
          if (isNaN(offset)) {
            throw new Error(`[Linker Error] Unresolved jump target address pointer: '${target}'`);
          }
          compiledProgram.push({ op: Opcode.JZ, arg1: regIdx, arg2: offset });
          break;
        }
        case 'PRINT': {
          this.assertPartsCount(parts, 2, 'PRINT Rx');
          const regIdx = this.parseRegister(parts[1]);
          compiledProgram.push({ op: Opcode.PRINT, arg1: regIdx });
          break;
        }
        case 'PUSH': {
          this.assertPartsCount(parts, 2, 'PUSH Rx');
          const regIdx = this.parseRegister(parts[1]);
          compiledProgram.push({ op: Opcode.PUSH, arg1: regIdx });
          break;
        }
        case 'POP': {
          this.assertPartsCount(parts, 2, 'POP Rx');
          const regIdx = this.parseRegister(parts[1]);
          compiledProgram.push({ op: Opcode.POP, arg1: regIdx });
          break;
        }
        case 'HALT': {
          compiledProgram.push({ op: Opcode.HALT });
          break;
        }
        default: {
          throw new Error(`[Parsing Error] unrecognized hardware processor instruction: '${opcodeStr}' at line '${line}'`);
        }
      }
    }

    return compiledProgram;
  }

  private static parseRegister(regStr: string): number {
    const clean = regStr.toUpperCase();
    if (clean === 'R1') return 0;
    if (clean === 'R2') return 1;
    if (clean === 'R3') return 2;
    if (clean === 'R4') return 3;
    throw new Error(`[Hardware Error] Target register index '${regStr}' is outside standard virtual CPU bounds. Supported registers are: (R1, R2, R3, R4)`);
  }

  private static assertPartsCount(parts: string[], expectedCount: number, syntaxGuide: string) {
    if (parts.length < expectedCount) {
      throw new Error(`[Syntax Error] Missing arguments. Correct structure is: '${syntaxGuide}'`);
    }
  }
}
export default SuperCompiler;
