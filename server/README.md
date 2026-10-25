# Backend v0.27.0

Update an existing Duolibee VM after this commit is published:

    cd "$HOME/duolibee-source" && git pull --ff-only && bash server/deploy_vm.sh

Deployment uses a fresh release directory and virtual environment, tests the candidate (including existing VM test_*.py), validates all 100 missions, and then activates a single-worker service override. Byte-identical tests already present in the repository are not copied twice; differing VM tests still run. Failed activation restores the previous override. The installed Git commit and resolved dependency versions are recorded. The deployment message reads the actual backend version.

Secrets, live SQLite data and old backups stay outside Git. A new SQLite recovery copy is created; old backups are not overwritten. Legacy sessions without verifiable ownership are not assigned to another user. They cannot be resumed publicly; start a new chat. Seven-day inactivity retention still applies.

Website v0.25.0 or newer is required for display-v2 numbering. OAuth and a real Gemini assessment require browser verification after installation. Geographic restrictions are disclosure-only. No paid-model fallback is added. Flask integration tests must pass on the VM before installation.

This release restores the tested replies 'Ako si Bee!' and 'Sa kuwento natin, taga-Pilipinas ako.' and versions the original dialogue regression suite without weakening its assertions.
