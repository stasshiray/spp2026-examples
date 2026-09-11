import type { Server } from "node:http";
import { promisify } from "node:util";

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
    console.log(`Received ${signal}, shutting down`);

    const forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out, exiting");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    try {
      if (server) {
        await promisify(server.close.bind(server))();
      }
      await close();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  return {
    isReady: () => ready,
    register(httpServer) {
      server = httpServer;
    },
  };
}
