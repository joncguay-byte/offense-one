# Offense One

Offense One is a mobile-first police reporting assistant that captures field audio, scene imagery, and supporting evidence, then generates a draft narrative report for officer review.

## Repo layout

- `apps/mobile`: Expo / React Native client for Android and iOS
- `apps/api`: Fastify + Prisma backend for auth, incidents, evidence, transcription jobs, and report generation
- `packages/shared`: shared types and prompt helpers
- `docs`: deployment and product notes

## Current product direction

- Record multi-speaker field audio
- Attach photos and other scene evidence to an event
- Transcribe and diarize selected evidence
- Generate a draft police narrative with AI assistance
- Keep human review in the loop before anything is final

## Local development

1. Copy [apps/api/.env.example](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/apps/api/.env.example) to `apps/api/.env`
2. Install dependencies with `npm install`
3. Start the API with `npm run dev:api`
4. Start the mobile app with `npm run dev:mobile`

Default demo logins:

- Officer: `officer@example.gov` / `ChangeMe123!`
- Supervisor: `supervisor@example.gov` / `ChangeMe123!`
- Admin: `admin@example.gov` / `ChangeMe123!`

## Hosted trial deployment

If you want the app to behave like a normal app without keeping your PC and a tunnel running, use Railway or a similar host for the API.

Start with:

- [docs/railway-deploy.md](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/docs/railway-deploy.md)
- [apps/api/.env.production.example](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/apps/api/.env.production.example)
- [railway.json](/C:/Users/ASOLAP7/Desktop/AI%20draft%20program/railway.json)

## Guardrail

Offense One should produce draft reports only. Final approval and final report responsibility stay with the officer or supervisor.
