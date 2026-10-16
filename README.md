# DUOLIBEE 🐝🇵🇭

DUOLIBEE is a playful, Duolingo-inspired Tagalog learning web app. It works entirely in the browser, saves progress locally, and can optionally back up progress to a private Google Drive app-data folder.

## Highlights

- 60 lessons across 12 units
- Multiple-choice, typed translation, listening, sentence-building, and matching exercises
- Spaced-repetition Practice Hub and crown levels for repeated mastery
- Daily goals, quests, streaks, streak freezes, automatic streak repair, gems, and hearts
- Achievements, profile statistics, and confetti rewards
- Dark mode, adjustable speech rate, sound effects, and progress reset
- Mobile-friendly design; installable from Chrome or Safari via **Add to Home Screen**

## Learning and pronunciation

DUOLIBEE uses five exercise types: multiple choice, typed translation, listening, sentence building, and matching. Lessons are stored as static JSON data, so the app runs without a backend.

For audio, DUOLIBEE prefers a Filipino or Tagalog system text-to-speech voice. If one is unavailable, it uses a pronunciation fallback in `pronunciation.js` to guide a generic voice toward Tagalog vowel targets, stress, `ng`, and `mga`. The app clearly identifies when it is using approximate pronunciation rather than a native Tagalog voice.

## Progress sync

Progress is always saved locally in browser `localStorage`. Users can optionally connect Google Drive to create a private backup in the app’s Drive app-data folder.

Cloud sync includes:

- Automatic sync after progress changes, when online
- Manual **Sync now** control
- Restore from Google Drive when starting on another device
- Conflict handling when local and cloud progress differ
- A local backup before restoring cloud progress
- Resume support for an unfinished lesson
- Offline operation: local saving continues if Google Drive is unavailable

The app requests only the Google Drive app-data scope, so it cannot browse or modify the rest of a user’s Drive files.

## Accessibility and interface

The interface includes high-contrast dark-mode surfaces, clear tab highlighting, readable headings and spacing, and accessible feedback for lessons, answers, statistics, and toasts. The bee mascot provides visual encouragement across the Learn, Practice, Quests, Profile, and Settings views.

## Project structure

| File / folder | Purpose |
|---|---|
| `index.html` | App shell and main interface |
| `app.js` | Core learning app, state, navigation, and UI |
| `learning-flow.js` | Lesson flow and exercise sequencing |
| `daily-progress.js` | Daily goals, quests, streaks, and progression |
| `lesson-retries.js` | Lesson retry behaviour |
| `pronunciation.js` | Tagalog pronunciation fallback |
| `speech-routing.js` | Text-to-speech voice selection and routing |
| `translation.js` | Translation support |
| `cloud-save.js` | Local storage and optional Google Drive sync |
| `category-generator.js` | Lesson/category generation tooling |
| `classic-rhymes.js` | Rhyme-based learning content |
| `data/lessons.json` | Lesson content |
| `data/rhymes.json` | Rhyme data |
| `assets/` | Transparent mascot images |

## Run locally

DUOLIBEE is a static web app; no build step or package installation is required.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages

GitHub Pages publishes the app directly from the `main` branch, using the repository root as the site root.

## Privacy

DUOLIBEE is designed for one user. It has no accounts, social leaderboards, analytics, or external user-data collection. Progress remains in browser storage unless the user explicitly connects Google Drive for private cloud backup.
