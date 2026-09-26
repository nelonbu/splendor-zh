# RCA: Express 5 Wildcard Route Crash in Production

**Date:** 2026-03-25
**Severity:** Blocking — server crashed on startup in production only
**Environment:** Railway (Docker, Node 20 Alpine, production deps only)

## Error

Railway healthcheck failed after a fresh build (no cache). Build logs confirmed esbuild was used and the 30s healthcheck window was active. The server returned "service unavailable" on all healthcheck attempts with zero server logs — indicating a startup crash before the server could bind to a port.

## Root Cause

The Express 5 catch-all route `app.get('*', ...)` threw a `PathError` at startup:

```
PathError [TypeError]: Missing parameter name at index 1: *
```

Express 5 uses `path-to-regexp` v8+ which no longer supports bare `*` as a wildcard. It requires a named parameter syntax like `/{*splat}`.

This crash only occurred in **production mode** because the catch-all route is behind an `if (process.env.NODE_ENV === 'production')` guard — it serves `index.html` for client-side routing. In development, Vite handles routing, so this code path never executes and the bug was invisible during local development and testing.

## Why It Was Hard to Detect

1. The route is inside a `NODE_ENV === 'production'` block — never runs in dev or test
2. The crash happens at route registration time (app startup), not at request time — no requests ever reach the server
3. Railway logs showed no server output at all (the crash occurs before `server.listen()`)
4. The previous two RCAs (ESM imports, Docker cache) masked this as the "real" underlying issue

## Fix

Changed the catch-all route from Express 4 syntax to Express 5 syntax:

```typescript
// Before (Express 4)
app.get('*', (_req, res) => { ... });

// After (Express 5)
app.get('/{*splat}', (_req, res) => { ... });
```

Verified by building the server with esbuild, installing only production deps, running with `NODE_ENV=production`, and confirming `GET /api/health` returns `200 OK`.

## Files Changed

- `server/index.ts` — line 173: `'*'` → `'/{*splat}'`

## Key Takeaway

When upgrading to Express 5, all wildcard routes must use named parameter syntax (`/{*name}`) instead of bare `*`. Code guarded by environment checks (`NODE_ENV === 'production'`) can hide bugs that only surface in deployment. To catch these, test the production build locally: build the server, install only production deps, set `NODE_ENV=production`, and verify the server starts.
