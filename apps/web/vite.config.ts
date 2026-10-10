import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  envPrefix: "NEXT_PUBLIC_",
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  test: {
    environment: "node",
  },
});
