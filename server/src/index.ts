import http from "node:http";
import { env } from "./config/env";
import { createApp } from "./app";
import { initSocket } from "./socket";
import { startScheduler, stopScheduler } from "./services/scheduler";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);
  startScheduler();

  server.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    stopScheduler();
    io.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  console.error("[server] failed to start", err);
  await prisma.$disconnect();
  process.exit(1);
});
