# Webpage updates (v0.29.0)

Settings > App updates > Refresh to latest webpage checks the actual published index.html with a cache-busting query and no-store request. It compares the HTML data-app-version with the loaded webpage version, rather than assuming every GitHub commit has reached Pages.

A newer version requires confirmation before reloading. Saved lesson progress and preferences are persisted locally first. Unsent Chat drafts are not persisted by this feature and may be lost; the confirmation says so. The button waits for tracked Chat session requests to finish. Reloading can require a new Google sign-in. Storage and browser caches are never cleared.

The reload includes an expected-version marker. On the next load the module reports whether that webpage version was actually received and removes its own temporary URL parameters. Older, malformed and failed responses do not trigger navigation.

Check VM version is a separate authenticated, read-only health request. It does not deploy the VM. Continue using voila for backend updates. This website-only release needs no VM restart.

The new button needs one normal manual webpage refresh to appear after this first deployment. Future frontend releases must bump data-app-version and the JavaScript/CSS asset version queries. Backend-only releases can retain a different webpage version.

Run the dependency-free mocked tests with:

    node tests/webpage-update.test.cjs

The tests cover version comparison, cache-busting, save and confirmation safeguards, error handling, VM-version authentication, in-flight Chat requests, post-reload version verification and Settings re-rendering. These are mocked Node checks, not live Safari or Google sign-in tests.
