import crypto from "crypto";
import type { Block } from "../types";

export const generateBlockId = ({
  height,
  transactions,
}: Omit<Block, "id">) => {
  return crypto
    .createHash("sha256")
    .update(height + transactions.map((transaction) => transaction.id).join(""))
    .digest("hex");
};
