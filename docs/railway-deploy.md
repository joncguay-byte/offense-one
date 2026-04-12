# Railway Deploy

This is the fastest path to make Offense One work like a normal app for a trial.

## What changes once this is hosted

- The API runs on Railway instead of your PC
- You stop using `npm run dev:api`
- You stop using `localtunnel`
- The phone app points at one stable public API URL

## What Railway needs

Railway can deploy a web service from this repo using [railway.json](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/railway.json).

The hosted API expects Node 20 or newer.

That file tells Railway to:

- build with `npm install && npm --workspace @scene-report/shared run build && npm --workspace @scene-report/api run build`
- start with `npm run start:api`
- health check `/api/health`

Railway documents deployment health checks and restart behavior here:
- [Railway deployment actions docs](https://docs.railway.com/deployments/deployment-actions)

## Trial deployment profile

This repo is set up for a simple hosted trial first, not full production hardening.

Trial defaults:

- `AUTH_MODE=demo`
- `STORAGE_BACKEND=local`
- `DATABASE_URL=file:./prisma/dev.db`

That is enough to prove the workflow, but it is not the final architecture. Railway can redeploy or restart services, so local SQLite and local uploads are trial-only storage.

## Step-by-step

1. Create a Railway account and a new project.
2. Connect this GitHub repo.
3. Choose the repo root as the service root.
4. Let Railway read [railway.json](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/railway.json).
5. Add the environment variables from [apps/api/.env.production.example](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/apps/api/.env.production.example).
6. Replace these values before deploying:
   - `OPENAI_API_KEY`
   - `JWT_SECRET`
7. Deploy the service.
8. Wait for the health check to pass at `/api/health`.
9. Copy the public Railway domain.
10. In the phone app, go to `Settings -> Backend Connection`.
11. Paste `https://your-service-domain/api`
12. Tap `Save API URL`
13. Tap `Test Connection`
14. Sign in and use the app normally

## Required environment variables

Set these in Railway:

- `NODE_ENV=production`
- `PORT=4000`
- `OPENAI_API_KEY=...`
- `DATABASE_URL=file:./prisma/dev.db`
- `EVIDENCE_STORAGE_PATH=./uploads`
- `STORAGE_BACKEND=local`
- `EXPORT_ADAPTER=local-json`
- `AUTH_MODE=demo`
- `JWT_SECRET=<long random secret>`
- `DEMO_USER_EMAIL=officer@example.gov`
- `DEMO_USER_PASSWORD=ChangeMe123!`
- `DEMO_SUPERVISOR_EMAIL=supervisor@example.gov`
- `DEMO_SUPERVISOR_PASSWORD=ChangeMe123!`
- `DEMO_ADMIN_EMAIL=admin@example.gov`
- `DEMO_ADMIN_PASSWORD=ChangeMe123!`

Optional blank values:

- `EXPO_PUSH_ACCESS_TOKEN=`
- `EXPORT_WEBHOOK_URL=`
- `OIDC_ISSUER_URL=`
- `OIDC_JWKS_URL=`
- `OIDC_AUDIENCE=`

## After the first hosted trial

Once the hosted flow is stable, the next upgrades should be:

- move `DATABASE_URL` to Railway Postgres
- move evidence storage to S3-compatible object storage
- use a permanent production API URL in the mobile app config
- add production auth/identity instead of demo credentials
