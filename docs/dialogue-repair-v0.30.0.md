# v0.30.0: staged numbered-dialogue repair

This commit adds a separately testable dialogue decision engine, its policy and 18 regression tests. It does not activate the engine, change the backend VERSION file, or modify authentication, quotas, deployment or saved learning progress. There is no need to run voila for this staging commit.

The engine distinguishes language score from task relevance, strips goal credit from off-topic decisions, uses a real conversational reply rather than appending the next generic goal prompt, and represents off-topic/needs-practice replies without the legacy failure-sticker status. It preserves assistance accounting and existing turn limits. Legacy sessions cannot be silently reinterpreted as protocol v2.

The tests exercise the screenshot's greeting and Puwet examples, but use supplied assessor decisions. They verify application behaviour, not whether Gemini will make the correct judgement. No live model requests are made by these tests.

Next integration must wire the new response schema and state transition into numbered missions, remove required-word-list grading from the mission goals, remove the duplicate greeting, and keep the existing auth/quota/replay boundaries. Only after integration and VM tests should a live browser acceptance check be requested. Do not describe this staged commit as fixing the running chat.

Local pure tests:

    cd server && python3 -m unittest test_conversation -v
