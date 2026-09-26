# RCA: Railway Deploying Stale Docker Cache

**Date:** 2026-03-25
**Severity:** Blocking — fixes pushed to git were not reflected in deploy
**Environment:** Railway (Docker, Node 20 Alpine)

## Error

Railway healthcheck continued to fail with the same error (`1/1 replicas never became healthy!`) even after pushing fixes for the ESM import resolution crash (RCA-001). Build logs showed identical timestamps and the old `tsc -p tsconfig.server.json` command instead of the new `esbuild` command, and `Retry window: 5s` instead of the updated 30s timeout.

## Root Cause

Railway's Docker builder aggressively cached all build layers. Even though `package.json` was modified (new `build:server` script) and `railway.toml` was updated (new healthcheck timeout), the Docker layer cache served the previous build output for every layer. The deploy ran entirely from cache — no source code changes were picked up.

The Dockerfile structure made this worse: `COPY . .` followed by separate `RUN` steps for each build command meant that if Docker considered the `COPY` layer unchanged (stale cache hash), all downstream `RUN` layers were also served from cache.

## Fix

1. **Added `ARG CACHE_BUST=1`** before the build step in the Dockerfile. This ARG acts as a cache-invalidation boundary — when Railway passes a different value (or when the Dockerfile itself changes), all layers from this point forward are rebuilt.

2. **Combined build steps** into a single `RUN npm run build && npm run build:server` to reduce cacheable surface area.

3. **User action required:** On first deploy after this change, clear Railway's build cache manually: Service > Settings > Build > "Clear Build Cache", then redeploy. Future deploys will properly invalidate cache because the Dockerfile itself has changed.

## Files Changed

- `Dockerfile` — added `ARG CACHE_BUST`, combined build RUN steps

## Key Takeaway

Docker layer caching on CI/CD platforms like Railway can aggressively serve stale builds. When a Dockerfile has separate `COPY` and `RUN` layers, the cache can persist across code changes if the platform's cache hashing doesn't detect the diff. Adding an explicit cache-bust ARG and combining build steps reduces this risk. When debugging "fix didn't work" deploy failures, always check whether the build logs reflect the latest code.
