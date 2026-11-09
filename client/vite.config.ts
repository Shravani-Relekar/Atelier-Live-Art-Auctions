import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const API = process.env.VITE_DEV_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/socket.io": { target: API, ws: true, changeOrigin: true },
    },
  },
});
