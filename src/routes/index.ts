import type { FastifyInstance } from "fastify";
import type { Block } from "../types";
import { addBlock, getBalance, rollback } from "../services";

export async function EmurgoApp(app: FastifyInstance) {
  app.post<{ Body: Block }>("/blocks", async (req, res) => {
    const result = await addBlock(req.body);

    if (result.success) {
      res.status(200).send(result);
    } else {
      res.status(result.statusCode).send(result);
    }
  });

  app.get<{ Params: { address: string } }>(
    "/balance/:address",
    async (req, res) => {
      const { address } = req.params;

      const result = await getBalance(address);
      if (result.success) {
        res.status(200).send(result.result);
      } else {
        res.status(result.statusCode).send(result);
      }
    }
  );
  app.post<{ Querystring: { height: number } }>(
    "/rollback",
    async (req, res) => {
      const { height } = req.query;

      const result = await rollback(height);

      if (result.success) {
        res.status(200).send(result);
      } else {
        res.status(result.statusCode).send(result);
      }
    }
  );
}
