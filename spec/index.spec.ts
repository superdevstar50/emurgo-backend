import { expect, test, beforeAll, describe, mock } from "bun:test";
import { pool } from "../src/db/pool";
import { addBlock, rollback, getBalance } from "../src/services";
import { createTables } from "../src/db/tables";
import type { Block } from "../src/types";
import { generateBlockId } from "../src/utils.ts";
import type { IResponse } from "../src/services/types.ts";
import { Pool } from "pg";

mock.module("../src/db/pool", () => ({
  pool: new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  }),
}));

function createBlock(block: Omit<Block, "id">) {
  return {
    ...block,
    id: generateBlockId(block),
  };
}

function expectSuccess(result: {
  success: boolean;
}): asserts result is { success: true } {
  expect(result.success).toBe(true);
}

function expectFail(result: {
  success: boolean;
}): asserts result is { success: false } {
  expect(result.success).toBe(false);
}

function expectFailWithMessage(result: IResponse, message: string) {
  expectFail(result);
  expect(result.error).toBe(message);
}

function expectSuccessWithResult<T = any>(response: IResponse, result: T) {
  expectSuccess(response);
  expect(response.result).toEqual(result);
}

describe("EmurgoApp", () => {
  beforeAll(async () => {
    await pool.query("DROP TABLE IF EXISTS transactions");
    await pool.query("DROP TABLE IF EXISTS blocks");
    await pool.query("DROP TABLE IF EXISTS balances");

    await createTables();
  });

  describe("add block", () => {
    test("invalid block id", async () => {
      expectFailWithMessage(
        await addBlock({
          height: 1,
          transactions: [
            {
              id: "tx1",
              inputs: [],
              outputs: [{ address: "addr1", value: 100 }],
            },
          ],
          id: "invalid id",
        }),
        "Invalid block ID"
      );
    });

    test("invalid block height", async () => {
      expectFailWithMessage(
        await addBlock(
          createBlock({
            height: 2,
            transactions: [
              {
                id: "tx1",
                inputs: [],
                outputs: [{ address: "addr1", value: 100 }],
              },
            ],
          })
        ),
        "Invalid block height"
      );
    });

    test("invalid transaction input id", async () => {
      expectFailWithMessage(
        await addBlock(
          createBlock({
            height: 1,
            transactions: [
              {
                id: "tx1",
                inputs: [
                  {
                    txId: "invalid id",
                    index: 0,
                  },
                ],
                outputs: [{ address: "addr1", value: 100 }],
              },
            ],
          })
        ),
        "Invalid transaction input id"
      );
    });

    test("add block with no input", async () => {
      expectSuccess(
        await addBlock(
          createBlock({
            height: 1,
            transactions: [
              {
                id: "tx1",
                inputs: [],
                outputs: [{ address: "addr1", value: 10 }],
              },
            ],
          })
        )
      );

      expectSuccessWithResult(await getBalance("addr1"), { balance: 10 });
    });

    test("invalid transaction input index", async () => {
      expectFailWithMessage(
        await addBlock(
          createBlock({
            height: 2,
            transactions: [
              {
                id: "tx2",
                inputs: [
                  {
                    txId: "tx1",
                    index: 1,
                  },
                ],
                outputs: [
                  {
                    address: "addr2",
                    value: 4,
                  },
                  {
                    address: "addr3",
                    value: 6,
                  },
                ],
              },
            ],
          })
        ),
        "Invalid transaction input index"
      );
    });

    test("input and output sums do not match", async () => {
      expectFailWithMessage(
        await addBlock(
          createBlock({
            height: 2,
            transactions: [
              {
                id: "tx2",
                inputs: [
                  {
                    txId: "tx1",
                    index: 0,
                  },
                ],
                outputs: [
                  {
                    address: "addr2",
                    value: 1,
                  },
                  {
                    address: "addr3",
                    value: 6,
                  },
                ],
              },
            ],
          })
        ),
        "Input and output sums do not match"
      );
    });

    test("add block with input", async () => {
      expectSuccess(
        await addBlock(
          createBlock({
            height: 2,
            transactions: [
              {
                id: "tx2",
                inputs: [
                  {
                    txId: "tx1",
                    index: 0,
                  },
                ],
                outputs: [
                  {
                    address: "addr2",
                    value: 4,
                  },
                  {
                    address: "addr3",
                    value: 6,
                  },
                ],
              },
            ],
          })
        )
      );

      expectSuccessWithResult(await getBalance("addr1"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr2"), { balance: 4 });
      expectSuccessWithResult(await getBalance("addr3"), { balance: 6 });
    });

    test("add block with multiple transactions", async () => {
      expectSuccess(
        await addBlock(
          createBlock({
            height: 3,
            transactions: [
              {
                id: "tx3",
                inputs: [
                  {
                    txId: "tx2",
                    index: 1,
                  },
                ],
                outputs: [
                  {
                    address: "addr4",
                    value: 2,
                  },
                  {
                    address: "addr5",
                    value: 2,
                  },
                  {
                    address: "addr6",
                    value: 2,
                  },
                ],
              },
              {
                id: "tx4",
                inputs: [],
                outputs: [
                  {
                    address: "addr7",
                    value: 12,
                  },
                ],
              },
            ],
          })
        )
      );

      expectSuccessWithResult(await getBalance("addr1"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr2"), { balance: 4 });
      expectSuccessWithResult(await getBalance("addr3"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr4"), { balance: 2 });
      expectSuccessWithResult(await getBalance("addr5"), { balance: 2 });
      expectSuccessWithResult(await getBalance("addr6"), { balance: 2 });
      expectSuccessWithResult(await getBalance("addr7"), { balance: 12 });
    });
  });

  describe("rollback", () => {
    test("invalid height", async () => {
      expectFailWithMessage(await rollback(6), "Invalid height");
    });

    test("rollback 1 step", async () => {
      expectSuccess(await rollback(2));

      expectSuccessWithResult(await getBalance("addr1"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr2"), { balance: 4 });
      expectSuccessWithResult(await getBalance("addr3"), { balance: 6 });
    });

    test("rollback multi steps", async () => {
      expectSuccess(await rollback(0));

      expectSuccessWithResult(await getBalance("addr1"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr2"), { balance: 0 });
      expectSuccessWithResult(await getBalance("addr3"), { balance: 0 });
    });
  });

  test("get balance", async () => {
    expectFailWithMessage(
      await getBalance("invalid address"),
      "Address not found"
    );
  });
});
