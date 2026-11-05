// snarkjs ships no type definitions. Only the calls this repo uses are declared.
declare module "snarkjs" {
  export type Groth16Proof = {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(vk: unknown, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
    prove(zkeyFile: string, witness: string | MemFile): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
  };
  export type MemFile = { type: "mem"; data?: Uint8Array };
  export const wtns: {
    calculate(input: Record<string, unknown>, wasmFile: string, wtnsFile: string | MemFile): Promise<void>;
    exportJson(wtnsFile: string | MemFile): Promise<Array<bigint | string>>;
  };
  export const r1cs: {
    info(r1csFile: string): Promise<{ nConstraints: number; nPrvInputs: number; nPubInputs: number; nOutputs: number }>;
  };
  export const zKey: {
    contribute(oldZkey: string, newZkey: string, name: string, entropy: string): Promise<Uint8Array>;
    verifyFromR1cs(r1cs: string, ptau: string, zkey: string): Promise<boolean>;
    exportVerificationKey(zkey: string): Promise<Record<string, unknown>>;
  };
}
