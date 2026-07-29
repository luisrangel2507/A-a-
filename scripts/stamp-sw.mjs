// Stamps the built service worker with this build's id.
//
// The cache name used to be a constant, which meant the activate step — whose whole
// job is deleting caches that are not the current one — never deleted anything. Old
// builds stayed cached indefinitely, and since a navigation falls back to the cached
// index when the network hiccups, and that index names old asset files which were
// also still cached, a phone could keep running a months-old version of the app
// through any number of deploys. That is the failure that makes a deploy look like
// it did not happen.
//
// With the id in the cache name, every deploy gets a fresh cache and the previous
// one is dropped the moment the new worker activates.
//
//   node scripts/stamp-sw.mjs      (run automatically after vite build)

import fs from "node:fs";

const SW = "dist/sw.js";

if (!fs.existsSync(SW)) {
  console.error(`stamp-sw: ${SW} not found — did vite build run?`);
  process.exit(1);
}

let id;
try {
  id = fs.readFileSync(".build-id", "utf8").trim();
} catch {
  console.error("stamp-sw: .build-id not found — vite.config.js should have written it.");
  process.exit(1);
}

const src = fs.readFileSync(SW, "utf8");
if (!src.includes("__BUILD_ID__")) {
  console.error("stamp-sw: no __BUILD_ID__ placeholder in the service worker.");
  process.exit(1);
}

fs.writeFileSync(SW, src.replaceAll("__BUILD_ID__", id));
console.log(`stamp-sw: service worker cache is quick-acai-${id}`);
