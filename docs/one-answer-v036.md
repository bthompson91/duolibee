# v0.36.0 — Answer each prompt once

Authentication/cookie work is paused and unchanged.

Continuous chat now has one required theme-response goal per prompt. A sufficient relevant beginner Tagalog/Taglish answer completes it; reciprocal questions or extra detail are not mandatory. Existing active snapshots migrate in place, including already-earned theme-response credit.

Correctly answered prompt wording is stored per account. Progression skips identical openings across lesson entries and skips prompts already answered correctly. Where the original cached assessment/session records provide verifiable theme-response credit, that credit is imported once. No language-score-only inference awards completion.

At the end of the finite catalog of distinct prompts, Bee preserves the thread and stops instead of silently looping. New distinct catalog prompts can resume it later. Erasing the thread also clears its prompt-completion ledger. Skipping a question does not mark it correct.

The main catalog and legacy session protocol remain unchanged. Only continuous-thread snapshots use the one-answer rule. Authentication, caps, history, hint assistance and ownership remain in place.

Preparation exercised the new progression class against a SQLite-backed adapter. The installer runs full source/VM tests, including new progression tests and existing frontend smoke checks, before committing or pushing. A live Gemini assessment still requires browser verification after deployment.
