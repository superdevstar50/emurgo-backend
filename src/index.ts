import Fastify from "fastify";
import { EmurgoApp } from "./routes";
import { createTables } from "./db/tables";

const fastify = Fastify({ logger: true });

async function bootstrap() {
  await createTables();

  fastify.register(EmurgoApp);
}

try {
  await bootstrap();

  await fastify.listen({
    port: 3000,
    host: "0.0.0.0",
  });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
