export enum Opcode {
  LOAD  = 0x01,  // LOAD Rx, constant -> Rx = constant
  LDM   = 0x02,  // LDM Rx, addr      -> Rx = memory[addr]
  STM   = 0x03,  // STM Rx, addr      -> memory[addr] = Rx
  ADD   = 0x04,  // ADD Rx, Ry        -> Rx = Rx + Ry
  SUB   = 0x05,  // SUB Rx, Ry        -> Rx = Rx - Ry
  JMP   = 0x06,  // JMP offset        -> PC = offset
  JZ    = 0x07,  // JZ Rx, offset     -> if Rx == 0, PC = offset
  PRINT = 0x08,  // PRINT Rx          -> output Rx content
  PUSH  = 0x09,  // PUSH Rx           -> stack.push(Rx)
  POP   = 0x0A,  // POP Rx            -> Rx = stack.pop()
  HALT  = 0x0F   // HALT              -> stop execution
}

export interface Instruction {
  op: Opcode;
  arg1?: number; // Target register indices (0..3 representing R1..R4) or values
  arg2?: number; // Source registers or values
}

export interface VMState {
  pc: number;
  registers: number[];
  stack: number[];
  memory: Record<number, number>;
  halted: boolean;
  cycles: number;
  stdout: string[];
}

/**
 * SuperOS Custom Stack-Based Stack VM core simulation
 */
export class VirtualMachine {
  private state: VMState;
  private instructions: Instruction[] = [];
  
  constructor() {
    this.state = this.resetState();
  }

  private resetState(): VMState {
    return {
      pc: 0,
      registers: [0, 0, 0, 0], // R1, R2, R3, R4
      stack: [],
      memory: {},
      halted: false,
      cycles: 0,
      stdout: []
    };
  }

  public loadProgram(encodedProgram: Instruction[]): void {
    this.instructions = encodedProgram;
    this.state = this.resetState();
  }

  /**
   * Run a loaded program step-by-step
   */
  public run(maxCycles = 1000): VMState {
    while (!this.state.halted && this.state.pc < this.instructions.length && this.state.cycles < maxCycles) {
      this.step();
    }
    if (this.state.cycles >= maxCycles && !this.state.halted) {
      this.state.stdout.push(`[CPU PANIC] SIGKILL: Execution exceeded cycle budget limit (${maxCycles} cycles).`);
      this.state.halted = true;
    }
    return this.state;
  }

  /**
   * Execute single compiler instruction cycle
   */
  public step(): void {
    if (this.state.halted || this.state.pc >= this.instructions.length) {
      this.state.halted = true;
      return;
    }

    const inst = this.instructions[this.state.pc];
    this.state.cycles++;
    this.state.pc++; // Advance instruction pointer

    switch (inst.op) {
      case Opcode.LOAD: {
        const regIdx = inst.arg1 ?? 0;
        const val = inst.arg2 ?? 0;
        this.verifyRegister(regIdx);
        this.state.registers[regIdx] = val;
        break;
      }
      case Opcode.LDM: {
        const regIdx = inst.arg1 ?? 0;
        const addr = inst.arg2 ?? 0;
        this.verifyRegister(regIdx);
        this.state.registers[regIdx] = this.state.memory[addr] ?? 0;
        break;
      }
      case Opcode.STM: {
        const regIdx = inst.arg1 ?? 0;
        const addr = inst.arg2 ?? 0;
        this.verifyRegister(regIdx);
        this.state.memory[addr] = this.state.registers[regIdx];
        break;
      }
      case Opcode.ADD: {
        const rDst = inst.arg1 ?? 0;
        const rSrc = inst.arg2 ?? 0;
        this.verifyRegister(rDst);
        this.verifyRegister(rSrc);
        this.state.registers[rDst] += this.state.registers[rSrc];
        break;
      }
      case Opcode.SUB: {
        const rDst = inst.arg1 ?? 0;
        const rSrc = inst.arg2 ?? 0;
        this.verifyRegister(rDst);
        this.verifyRegister(rSrc);
        this.state.registers[rDst] -= this.state.registers[rSrc];
        break;
      }
      case Opcode.JMP: {
        const offset = inst.arg1 ?? 0;
        this.state.pc = offset;
        break;
      }
      case Opcode.JZ: {
        const regIdx = inst.arg1 ?? 0;
        const offset = inst.arg2 ?? 0;
        this.verifyRegister(regIdx);
        if (this.state.registers[regIdx] === 0) {
          this.state.pc = offset;
        }
        break;
      }
      case Opcode.PRINT: {
        const regIdx = inst.arg1 ?? 0;
        this.verifyRegister(regIdx);
        const val = this.state.registers[regIdx];
        this.state.stdout.push(`[stdout] PID-OUT R${regIdx + 1} = ${val}`);
        break;
      }
      case Opcode.PUSH: {
        const regIdx = inst.arg1 ?? 0;
        this.verifyRegister(regIdx);
        this.state.stack.push(this.state.registers[regIdx]);
        break;
      }
      case Opcode.POP: {
        const regIdx = inst.arg1 ?? 0;
        this.verifyRegister(regIdx);
        if (this.state.stack.length === 0) {
          this.state.stdout.push(`[CPU ERROR] Stack Underrun at cycle ${this.state.cycles}`);
          this.state.halted = true;
          break;
        }
        const val = this.state.stack.pop() ?? 0;
        this.state.registers[regIdx] = val;
        break;
      }
      case Opcode.HALT:
      default: {
        this.state.halted = true;
        break;
      }
    }
  }

  private verifyRegister(index: number) {
    if (index < 0 || index >= 4) {
      throw new Error(`[CPU PANIC] Invalid register index R${index + 1}. Hardware address registers bound strictly across (R1-R4)`);
    }
  }

  public getStdout(): string[] {
    return this.state.stdout;
  }
}
