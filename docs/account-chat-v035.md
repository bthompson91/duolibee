# v0.35.0 — Chat badges and Google connection flow

No Duolibee authentication cookie, persistent app login or stored Google token is added.

Chat shows a dot for newly available lesson practice and a count for actual unread Bee messages. Read positions are account-scoped on this device. Read-only notification polling neither creates a conversation nor calls Gemini. A thread is marked seen only after rendering in a visible Chat tab.

Google sign-in automatically continues toward Drive consent. The Google permission screens remain. A blocked/closed popup or denied consent exposes a Finish connecting recovery action, rather than pretending the user has signed out. Renewing identity for the same account preserves a still-valid Drive access token. Account changes discard the old token. Where Google/browser policies allow it, One Tap can offer returning-user sign-in; explicitly signing out suppresses that offer for this tab session. Tokens remain in memory and can still expire or be lost on reload.

Tests: preparation exercised the notification store, connection-flow callbacks and badge arithmetic. The installer runs the source/VM Python suites and, if Node is available, JavaScript checks before commit/push. Real Google consent and browser behaviour still need checking after deployment.
