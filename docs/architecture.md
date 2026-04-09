# Architecture Overview

## Product shape

Offense One consists of a mobile client, an API backend, persistent storage, and AI orchestration services that transform scene evidence into a grounded draft narrative.

## Major flows

1. Officer creates an incident shell.
2. Mobile app records audio and captures scene images.
3. Evidence is uploaded and stored with audit entries.
4. Audio is diarized into speaker segments.
5. Officer reviews unnamed speakers and assigns labels.
6. Vision analysis summarizes scene observations from captured imagery.
7. Report generation produces a grounded draft with citations and confidence notes.
8. Officer reviews and edits before supervisor approval or export.

## Non-negotiable controls

- Human review before any report leaves draft state
- Audit log for every major action
- Explicit citations back to evidence
- Confidence notes when the model lacks enough information
- Separation of raw evidence from generated summaries

## Deployment notes

- Replace SQLite with PostgreSQL before production
- Replace local uploads with encrypted object storage
- Add SSO / MDM-aware authentication
- Add RMS / CAD integrations as separate adapters
