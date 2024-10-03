import { pool } from "../db/pool";
import type { Block, Input, Transaction } from "../types";
import { ClientError, type IResponse } from "./types";
import { generateBlockId } from "../utils.ts";
import type { IBalance, IBlock, ITransaction } from "../db/model.ts";
import type { PoolClient } from "pg";

const getOutputFromInput = async (client: PoolClient, input: Input) => {
  const { rows } = await client.query<Pick<ITransaction, "outputs">>(
    "SELECT outputs FROM transactions WHERE id = $1",
    [input.txId]
  );
  if (rows.length === 0) {
    throw new ClientError("Invalid transaction input id");
  }
  const output = rows[0].outputs[input.index];
  if (!output) {
    throw new ClientError("Invalid transaction input index");
  }
  return output;
};

const addBalance = async (
  client: PoolClient,
  address: string,
  balance: number
) => {
  await client.query(
    "UPDATE balances SET balance = balance + $1 WHERE address = $2",
    [balance, address]
  );
};

export const addBlock = async (block: Block): Promise<IResponse> => {
  const { id, height, transactions } = block;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: lastBlock } = await client.query<IBlock>(
      "SELECT * FROM blocks ORDER BY height DESC LIMIT 1"
    );
    const lastHeight = lastBlock[0]?.height ?? 0;

    if (height !== lastHeight + 1) {
      throw new ClientError("Invalid block height");
    }

    for (const transaction of transactions) {
      const inputSum = (
        await Promise.all(
          transaction.inputs.map((input) => getOutputFromInput(client, input))
        )
      ).reduce((sum, output) => sum + output.value, 0);

      const outputSum = transaction.outputs.reduce(
        (sum, transaction) => sum + transaction.value,
        0
      );

      if (transaction.inputs.length > 0 && inputSum !== outputSum) {
        throw new ClientError("Input and output sums do not match");
      }
    }

    const expectedHash = generateBlockId(block);
    if (id !== expectedHash) {
      throw new ClientError("Invalid block ID");
    }

    await client.query("INSERT INTO blocks (id, height) VALUES ($1, $2)", [
      id,
      height,
    ]);

    for (const transaction of transactions) {
      await client.query(
        "INSERT INTO transactions (id, block_id, inputs, outputs) VALUES ($1, $2, $3, $4)",
        [transaction.id, id, transaction.inputs, transaction.outputs]
      );

      for (const { address, value } of transaction.outputs) {
        await client.query(
          `
              INSERT INTO balances (address, balance)
              VALUES ($1, $2)
              ON CONFLICT (address) DO UPDATE SET balance = balances.balance + $2`,
          [address, value]
        );
      }

      for (const input of transaction.inputs) {
        const { address, value } = await getOutputFromInput(client, input);
        await addBalance(client, address, -value);
      }
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");

    if (err instanceof ClientError) {
      return { success: false, statusCode: 400, error: err.message };
    }

    return {
      success: false,
      statusCode: 500,
      error: "Internal Server Error",
      details: err,
    };
  } finally {
    client.release();
  }
};

export const rollback = async (height: number): Promise<IResponse> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: blocksToRollback } = await client.query<IBlock>(
      "SELECT * FROM blocks WHERE height > $1 ORDER BY height DESC",
      [height]
    );

    if (blocksToRollback.length === 0) {
      throw new ClientError("Invalid height");
    }

    for (const block of blocksToRollback) {
      const { rows: transactions } = await client.query<ITransaction>(
        "SELECT * FROM transactions WHERE block_id = $1",
        [block.id]
      );

      for (const transaction of transactions) {
        for (const { address, value } of transaction.outputs) {
          await addBalance(client, address, -value);
        }

        for (const input of transaction.inputs) {
          const { address, value } = await getOutputFromInput(client, input);
          await addBalance(client, address, value);
        }
      }

      await client.query("DELETE FROM transactions WHERE block_id = $1", [
        block.id,
      ]);
      await client.query("DELETE FROM blocks WHERE id = $1", [block.id]);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");

    if (err instanceof ClientError) {
      return { success: false, statusCode: 400, error: err.message };
    }

    return {
      success: false,
      statusCode: 500,
      error: "Internal Server Error",
      details: err,
    };
  } finally {
    client.release(); // Release the client back to the pool
  }
};

export const getBalance = async (
  address: string
): Promise<IResponse<{ balance: number }>> => {
  const { rows } = await pool.query<IBalance>(
    "SELECT * FROM balances WHERE address = $1",
    [address]
  );

  if (rows.length === 0) {
    return { success: false, statusCode: 404, error: "Address not found" };
  }

  return { success: true, result: { balance: rows[0].balance } };
};
