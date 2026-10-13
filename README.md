# DUOLIBEE 🐝🇵🇭

A Duolingo-inspired, offline-first Tagalog learning web app with 60 lessons and a full progression system.

## Learning features

- 60 lessons across 12 units
- Multiple choice, typed translation, listening, sentence building, and matching exercises
- Text-to-speech Tagalog pronunciation
- Spaced-repetition Practice Hub
- Crown levels for repeated lesson mastery

## Progression

- Daily XP goal and daily quests
- Streaks, streak freezes, and automatic streak repair
- Gems, hearts with timed regeneration, heart refills, and 2x XP boosts
- Achievements, weekly league, profile statistics, and confetti rewards
- Dark mode, adjustable speech rate, sound effects, and progress reset

## Data

All progress is stored locally in the browser using `localStorage`. No account, backend, or external service is required.

## Development

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## GitHub Pages

The repository includes a GitHub Actions workflow that deploys the static site to Pages on every push to `main`.
