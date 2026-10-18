import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../extension/src/shared"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
