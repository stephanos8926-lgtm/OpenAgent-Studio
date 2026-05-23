# Quickstart Guide: Writing Assembly Programs on SuperOS

SuperOS features a full custom assembler, link engine, and register-to-stack virtual machine built in pure TypeScript. This guide walks you through composing your first simulated execution programs.

## 1. Simple Mathematical Pipeline (Example)
Let's add two constant values, store them in virtual memory address space, and display the result.

```assembly
; Simple addition arithmetic block
LOAD R1 150       ; Set R1 = 150
LOAD R2 350       ; Set R2 = 350
ADD R1 R2         ; Add registries together: R1 = R1 + R2 (500)
STM R1 1000       ; Write register R1 content to memory index 1000
PRINT R1          ; Print calculation value to stdout channel
HALT              ; Terminate CPU execution loop
```

---

## 2. Dynamic Jump Loops and Countdowns (Example)
Let's create a program that runs a mathematical loop counting down from 5 to 0.

```assembly
; Count down loop block
LOAD R1 5         ; Set loop index register R1 = 5
LOAD R2 1         ; Set decrement step counter R2 = 1

loop:             ; Declare jump helper label loop
PRINT R1          ; Output remaining cycle value
SUB R1 R2         ; Decrement index check: R1 = R1 - R2
JZ R1 end         ; If R1 reaches zero, jump control index target to end label
JMP loop          ; Jump back to top of execution loop

end:              ; Stop target jump label
HALT              ; Gracefully end program
```
