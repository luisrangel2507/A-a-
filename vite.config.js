import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";

// A stamp for each build, so both the app and the service worker can say which one
// they are. Without it a deploy that has landed is indistinguishable from one that
// has not — which is exactly the confusion a cached service worker creates.
function buildId() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    // Not a git checkout, or git is not in the build image. Fall through.
  }
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

const BUILD_ID = buildId();
// Written out so scripts/stamp-sw.mjs stamps the service worker with the same value
// rather than computing its own and disagreeing.
fs.writeFileSync(".build-id", BUILD_ID);

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 4173,
  },
});
