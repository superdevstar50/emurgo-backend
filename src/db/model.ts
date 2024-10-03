import type { Input, Output } from "../types";

export interface IBlock {
  id: string;
  height: number;
}

export interface ITransaction {
  id: string;
  inputs: Input[];
  outputs: Output[];
  block_id: string;
}

export interface IBalance {
  address: string;
  balance: number;
}
