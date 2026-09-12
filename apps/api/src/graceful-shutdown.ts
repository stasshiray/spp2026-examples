import type { Server } from "node:http";
import { promisify } from "node:util";
import { logger } from "./logger";

const FORCE_EXIT_MS = 20_000;

export type GracefulShutdown = {
  isReady: () => boolean;
  register: (server: Server) => void;
};

export function createGracefulShutdown(
  close: () => Promise<void>,
  timeoutMs = FORCE_EXIT_MS,
): GracefulShutdown {
  let ready = true;
  let server: Server | undefined;

  async function shutdown(signal: string) {
    if (!ready) {
      return;
    }

    ready = false;
    logger.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      logger.error({ signal, timeoutMs }, "graceful shutdown timed out");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    try {
      if (server) {
        await promisify(server.close.bind(server))();
      }
      await close();
      logger.info({ signal }, "shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, signal }, "shutdown failed");
      process.exit(1);
    }
  }

  process.on("SIGTERM", async () => {
    await shutdown("SIGTERM");
  });
  process.on("SIGINT", async () => {
    await shutdown("SIGINT");
  });

  return {
    isReady: () => ready,
    register(httpServer) {
      server = httpServer;
    },
  };
}
