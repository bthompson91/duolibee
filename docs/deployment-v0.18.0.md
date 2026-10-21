# v0.18.0: retire wedding UI and stage Review conversations

This is a website-only update. It is not a deployment of the chat backend.

- Main app version and asset query strings: 0.18.0, above the retired wedding page's observed 0.17.0.
- Remove wedding-emergency.js from the main script list; neutralise that module and its standalone application scripts.
- Replace wedding.html with a retirement notice; historical lesson/data assets remain on disk but are not loaded by this page.
- Extract the existing inline review implementation into review-core.js without intentional logic changes.
- Label the existing practice route Review; preserve route IDs, progress, review tools and vocabulary selection.
- Append an unavailable Conversations card below existing review content. No chat inputs, provider requests or scores are enabled.
- Existing data/conversations.json and data/conversation-policy.json remain inactive drafts.
- The private backend ZIP prepared in conversation is not installed or published by this commit.

Next backend work: run the Flask integration tests on Oracle, finish no-answer-leak checks, design/verify public authentication and ownership, enforce quotas and concurrency, review provider age/region/data eligibility, review mission content, then test private integration. Do not expose the local-only prototype via Nginx. No Oracle, Gemini project, translation, or Whiteboard Generator configuration changes are included.

Hint requirement for integration: English-only/help/uncertain responses use deterministic feedback without model-provided answers. Explicit hint levels are intent explanation, starter, full example. Level 2/3 assistance is stored per goal. Scored Tagalog feedback still needs leak testing; an instruction alone is not an enforcement guarantee.

Validation: changes have not been browser-tested in this environment; verify main load, Settings without wedding controls, Review tools, Conversations placeholder, and retired wedding link after deployment. Backend remains unavailable until separately deployed and tested.
