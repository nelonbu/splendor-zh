# RCA: Railway Deployment Healthcheck Failure

**Date:** 2026-03-25
**Severity:** Blocking — app could not deploy
**Environment:** Railway (Docker, Node 20 Alpine)

## Error

Railway deployment failed with: `1/1 replicas never became healthy! Healthcheck failed!`

The Docker image built successfully, but the container never responded to the healthcheck at `GET /api/health`.

## Root Cause

The server crashed immediately on startup due to **Node.js ESM import resolution failure**.

The project uses `"type": "module"` in `package.json`, making all `.js` files ESM. The server TypeScript was compiled with `tsc` using `moduleResolution: "bundler"`, which allows extensionless imports (e.g., `from './auth'`). The compiled JavaScript preserved these extensionless imports verbatim. However, Node.js native ESM requires explicit `.js` extensions on all relative imports (e.g., `from './auth.js'`). The server process crashed before it could bind to a port or respond to any requests.

A secondary issue was that `healthcheckTimeout` in `railway.toml` was set to only 5 seconds, which is too tight for Railway container cold starts even when the server is healthy.

## Fix

1. **Replaced `tsc` with `esbuild` for the server build.** esbuild bundles all source files (server code + game engine) into a single `dist-server/index.js`, eliminating all local import resolution at runtime. The `build:server` script changed from `tsc -p tsconfig.server.json` to `esbuild server/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist-server/index.js --packages=external`.

2. **Increased `healthcheckTimeout`** in `railway.toml` from 5s to 30s to accommodate container cold start time.

## Files Changed

- `package.json` — `build:server` script switched from tsc to esbuild
- `railway.toml` — healthcheck timeout 5s → 30s
- `server/index.ts`, `server/socketHandlers.ts`, `server/roomManager.ts` — added `.js` extensions to local imports (good practice, though esbuild bundling makes this non-critical)

## Key Takeaway

When compiling TypeScript to ESM for direct Node.js execution, `moduleResolution: "bundler"` produces output that Node.js cannot run. Either use `moduleResolution: "nodenext"` with `.js` extensions everywhere, or use a bundler (esbuild) to produce a single output file that has no local imports to resolve.
