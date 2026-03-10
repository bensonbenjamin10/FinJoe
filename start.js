#!/usr/bin/env node
/**
 * Unified entry point for Railway deployments.
 * Uses RAILWAY_SERVICE_NAME to start the correct service.
 */
const service = process.env.RAILWAY_SERVICE_NAME || "";

if (service === "finjoe-worker") {
  import("./worker/dist/index.js");
} else {
  import("./dist/index.js");
}
