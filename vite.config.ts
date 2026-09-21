import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: process.env.PRICEBTC_BUILD_CLIENT_DIR ?? "dist/client",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.PORT ?? "3466"}`,
      "/healthz": `http://127.0.0.1:${process.env.PORT ?? "3466"}`,
    },
  },
});
