# Offense One

Production-oriented foundation for a mobile law-enforcement report assistant inspired by Draft One-style workflows.

## What this repo includes

- `apps/mobile`: Expo / React Native mobile client for Android and iOS
- `apps/api`: Node/TypeScript API for incidents, evidence, transcripts, AI orchestration, and audit logs
- `packages/shared`: shared types and prompt helpers used by both apps
- `docs`: product and architecture notes

## Core capabilities planned

- Multi-speaker field audio capture
- Speaker diarization and officer-assisted renaming
- Scene photo capture and visual scene analysis
- Draft narrative generation with explicit source grounding
- Review, correction, and export workflow
- Audit logging and compliance-oriented data handling

## Important guardrail

The system should generate draft reports only. Final approval must remain with the officer or supervisor.

## Getting started

1. Copy `.env.example` to `.env` in `apps/api`
2. Install dependencies with `npm install`
3. Use the default PostgreSQL `DATABASE_URL` from `apps/api/.env.example`, or point it at your managed Postgres instance
4. Log in with the seeded demo accounts:
   - Officer: `officer@example.gov` / `ChangeMe123!`
   - Supervisor: `supervisor@example.gov` / `ChangeMe123!`
5. Run `docker compose up -d` to start PostgreSQL and MinIO locally
6. Run `npm --workspace @scene-report/api run prisma:push`
7. Start the API with `npm run dev:api`
8. Start the mobile app with `npm run dev:mobile`

## Local Infra

Run `docker compose up -d` to start the included PostgreSQL and MinIO stack for production-style local testing. The `minio-bootstrap` service creates the `offense-one-evidence` bucket automatically.

## Auth Modes

- `AUTH_MODE=demo`: local password login using the seeded demo users
- `AUTH_MODE=oidc`: bearer-token verification against an OIDC provider such as Keycloak

When using OIDC mode, configure `OIDC_ISSUER_URL` and `OIDC_AUDIENCE` in `apps/api/.env`. Password login is disabled in that mode.

For mobile Keycloak sign-in, also set these values in `apps/mobile/app.json` under `expo.extra`:
- `oidcIssuerUrl`
- `oidcClientId`
- `oidcAudience`

## Current status

This repo now includes database-backed demo authentication, incident and evidence workflows, report review endpoints, and a mobile app wired to real backend calls.
