# Bee conversations: inactive support files

Status: planning/content only. No chat UI, model calls, server deployment, or changes to lesson progression are included. Data is not loaded by the app.

## Content
`data/conversations.json` contains 50 draft missions: midpoint and end-of-topic for each of 25 current themes. Each defines an opening, scenario, and learner goals. Shared defaults specify guided versus independent style. These are flexible conversations, not exact-answer scripts.

`data/conversation-policy.json` records proposed evaluation, hints, safety, privacy, quota and runtime rules. Rules are specifications, not implemented protections.

This compact repository catalogue is not a verbatim copy of the earlier downloadable pack. It preserves the 50 scenarios and goal sets; reviewed per-goal hints, accepted-answer examples, a strict output schema and tests remain to be authored/integrated. No claim is made that the content has had proficient-speaker review.

## Placement and prerequisites
Future home: Review, below existing review tools. The current UI calls that screen Practice; this commit does not rename it. No lesson gating. Proposed availability: midpoint after two completed topic lessons, end after four. Exact lesson IDs and demonstrated vocabulary coverage remain unmapped. The generator reuses items, so completion counts do not guarantee coverage. Teach or scaffold supplementary language before requiring it.

## Planned architecture
Browser -> existing Oracle HTTPS entry point -> separate Python chat module/service -> Gemini free tier. Keep translations unchanged. No model inference on Oracle. Inspect current helper, resources and Nginx before selecting implementation. Keep provider key private, restrict backend to localhost, expose only the HTTPS route. Do not install or restart anything from this commit.

## Public-app requirements
Verify authentication and session ownership. CORS is not authentication. Add per-user/IP abuse controls, global caps, fixed model selection, bounded concurrency/context and token usage. Use a free-tier project without paid billing; pause at quota exhaustion, never fall back to paid service. Free public access is capacity-limited, not unlimited. Review provider data terms and update privacy notices before release.

## Server processing contract
Validate session/revision/idempotency -> check limits -> load trusted mission and history -> obtain structured assessment -> validate fields and quoted learner evidence -> compute score and update goals in code -> generate bee reply toward next pending goal -> atomically persist -> return. Never accept authoritative scores from the browser. Keep assessment and reply generation logically separate; measure latency/quota before optimising calls.

Suggested future routes: create/get session, submit message, request hint, retry prior task, end session, delete session. Persist messages, attempts, goal evidence and usage in a small database with explicit retention/deletion. The backend implementation is intentionally deferred.

## Before activation
1. Proficient Tagalog review of all authored language and register.
2. Exact prerequisite/coverage mapping and reviewed hints/examples.
3. Strict JSON schemas and validation tests.
4. Human-reviewed evaluation set: valid alternatives, fragments, code-switching, wrong meanings, help requests and fictional details.
5. Test repeatability, false corrections, multi-goal replies and goal order.
6. Test timeout, duplicate send, refresh/resume, concurrent devices, quota exhaustion and user isolation.
7. Review special handling for real health concerns.
8. Deploy/test one mission before enabling the remaining catalogue.
9. Add Review UI only when explicitly requested; disconnected state must not fabricate scores.

## Versioning
Support-file staging bumps app v0.11.0 to v0.12.0. No conversations are enabled. Future commits must also increment the app version according to project instructions.
