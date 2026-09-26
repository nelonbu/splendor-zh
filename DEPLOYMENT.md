# Deployment Guide

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | — | Set to `production` for deployed environments |
| `SITE_PASSWORD` | Yes | — | Password users must enter to access the app |
| `JWT_SECRET` | Yes | `default-dev-secret` | Secret key for signing JWT tokens. Use a random 64-character string in production |
| `ANTHROPIC_API_KEY` | No | — | Server-side Anthropic API key for hosted AI mode (players won't need their own key) |
| `PORT` | No | `3001` | Port the server listens on |

## Deploy on Railway

1. **Connect repository** — In the Railway dashboard, create a new project and select "Deploy from GitHub repo". Connect this repository.

2. **Set environment variables** — In the service's **Variables** tab, add:
   - `NODE_ENV` = `production`
   - `SITE_PASSWORD` = *(your chosen password)*
   - `JWT_SECRET` = *(random 64-character string)*
   - `ANTHROPIC_API_KEY` = *(optional, for hosted AI)*

3. **Deploy** — Railway will automatically build using the `Dockerfile` and `railway.toml` configuration. The first deploy triggers on connection; subsequent deploys trigger on pushes to `main`.

4. **Verify** — Once deployed, visit your Railway-provided URL. You should see the password gate. Enter your `SITE_PASSWORD` to access the app.

## Custom Domain

1. In the Railway service settings, go to **Settings > Networking > Custom Domain**.
2. Add your domain (e.g., `splendor.example.com`).
3. Create a CNAME record with your DNS provider pointing to the Railway-provided target.
4. Railway will automatically provision an SSL certificate.

## Changing the Password

Update the `SITE_PASSWORD` environment variable in Railway. This invalidates all existing sessions — users will need to re-enter the new password. Railway will automatically redeploy.

## Health Check

The server exposes a health check endpoint at:

```
GET /api/health
```

Returns `200 OK` with `{ "status": "ok" }`. Railway is configured to use this endpoint for health monitoring (see `railway.toml`).
