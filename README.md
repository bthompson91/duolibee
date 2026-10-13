# DUOLIBEE 🐝🇵🇭

A single-user, offline-first Tagalog learning web app with 60 lessons and Duolingo-style motivation.

## Learning features

- 60 lessons across 12 units
- Multiple choice, typed translation, listening, sentence building, and matching exercises
- Text-to-speech Tagalog pronunciation
- Spaced-repetition Practice Hub
- Crown levels for repeated lesson mastery

## Personal progression

- Daily XP goal and daily quests
- Streaks, streak freezes, and automatic streak repair
- Gems, hearts with timed regeneration, heart refills, and 2x XP boosts
- Achievements, personal weekly XP tracking, profile statistics, and confetti rewards
- Dark mode, adjustable speech rate, sound effects, and progress reset

## Data and privacy

DUOLIBEE is designed for one user. There are no accounts, social leaderboards, analytics, or external user data. All progress is saved locally on your phone or computer using browser `localStorage`.

For the most reliable phone experience, open the GitHub Pages site in Chrome or Safari and choose **Add to Home Screen**. Avoid clearing site data if you want to preserve your streak and progress.

## Development

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## GitHub Pages

The repository includes a GitHub Actions workflow that deploys the static site to Pages on every push to `main`.
