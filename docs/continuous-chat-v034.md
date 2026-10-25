# Continuous Bee thread — v0.34.0

- One server-owned transcript per authenticated account, automatically opened from Chat.
- Old account-owned sessions are imported once, preserving originals.
- Completed or ended exchanges append locally generated qualitative assessment feedback and the next lesson opening.
- A single backing session is reused, so 5/20 legacy session-count caps do not accumulate each lesson.
- White IM surface and system sans-serif fonts; no picker, numeric scorecard or per-turn score stickers.
- Existing assessment validation, Google sign-in, origin checks, request idempotency and quota counters remain.
- Thread request IDs are scoped to account; cache replay does not call the provider twice.
- Recent context crosses exchange boundaries; full history is stored server-side and paginated 100 messages at a time.
- At lesson 100, practice cycles back to lesson 1. No lesson rewards/progress are awarded by chat.
- Erase controls delete the continuous copy and its backing session, not legacy originals or backups.

## Testing

23 core-store tests and a mocked-DOM JavaScript smoke suite ran during preparation. The installer additionally runs the complete source test suite, 6 real Flask HTTP integration tests, and existing VM test files before committing/pushing. A real browser/provider assessment still needs checking after deployment.

## Deployment

Run the installer on the VM, then `voila`. Deploy the backend before loading the updated frontend. If the frontend arrives first it reports that the continuous-chat backend is not installed rather than creating legacy sessions.
