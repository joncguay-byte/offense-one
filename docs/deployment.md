# Offense One Deployment Notes

## Development defaults

- Prisma schema now targets PostgreSQL.
- Demo users are seeded automatically on API startup.
- Evidence is stored on the local filesystem under the configured upload directory.
- A local infrastructure stack for PostgreSQL and MinIO is provided in `docker-compose.yml`.

## Production changes still recommended

- Replace local evidence storage with encrypted object storage.
- Replace demo login with agency SSO or managed identity.
- Add HTTPS, MDM-aware device controls, and agency audit retention policies.
- Add background jobs for transcription, vision analysis, retries, and export integrations.

## Storage modes

- `STORAGE_BACKEND=local` stores uploaded evidence on the API server filesystem.
- `STORAGE_BACKEND=s3` stores uploaded evidence in an S3-compatible bucket and materializes it on demand for AI processing.

## Local bootstrap flow

1. Run `docker compose up -d`.
2. Wait for `postgres`, `minio`, and `minio-bootstrap` to settle.
3. Run `npm --workspace @scene-report/api run prisma:push`.
4. Start the API; demo users are seeded automatically on startup.

## Current review workflow

- Officers generate draft narratives from available audio and image evidence.
- Supervisors can approve or reject a generated report with review notes.
- Incident status moves into review when a draft is generated and to approved when a report is approved.
- Audio ingest, report generation, and export now run as queued jobs instead of blocking the API request.
- Approved reports are exported through a local JSON adapter scaffold that can be replaced with RMS/CAD-specific integrations.
- Users receive in-app notifications for queued job completion, failures, approvals, and exports.
- Export payloads now follow an RMS-oriented envelope with case, report, and transmission sections.
- Incidents can be assigned to supervisors, and notifications are routed to both the reporting officer and assigned reviewer.
- Device push tokens can now be registered through the API, providing a path toward real push delivery beyond in-app polling.
- Expo push delivery is now wired server-side; mobile devices register real Expo push tokens when a valid Expo project ID is configured in `apps/mobile/app.json`.

## Keycloak / OIDC Mode

- Set `AUTH_MODE=oidc` in the API environment.
- Set `OIDC_ISSUER_URL` to your Keycloak realm issuer URL.
- Set `OIDC_AUDIENCE` to the API client audience expected in access tokens.
- Optionally set `OIDC_JWKS_URL` if you do not want to use the issuer default certs endpoint.
- Offense One will upsert users from trusted OIDC claims and map roles from `OIDC_ROLES_CLAIM`.
- In OIDC mode, `/api/auth/login` is disabled and clients should use external sign-in to obtain bearer tokens.
- The mobile app now includes a Keycloak sign-in button using Expo auth-session. Set `oidcIssuerUrl`, `oidcClientId`, and `oidcAudience` in `apps/mobile/app.json`.
- The Keycloak mobile client should allow the `offense-one://` redirect scheme used by the Expo app.
