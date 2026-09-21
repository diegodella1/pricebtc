import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/",
  define: {
    "import.meta.env.VITE_STATIC_BUILD": JSON.stringify("true"),
  },
  build: {
    outDir: "pricebtc-freehosting",
    emptyOutDir: true,
    sourcemap: false,
  },
});
