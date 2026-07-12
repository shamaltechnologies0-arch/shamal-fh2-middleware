import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@web": path.resolve(__dirname, "./src"),
      "@ui": path.resolve(__dirname, "./src/components/ui"),
    },
  },
  build: {
    outDir: "../api/src/assets/ui/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": { target: "http://127.0.0.1:8080", changeOrigin: true },
      "/bg-image": { target: "http://127.0.0.1:8080", changeOrigin: true },
      "/logo": { target: "http://127.0.0.1:8080", changeOrigin: true },
    },
  },
});
