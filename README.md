# Lumpia Lingo 🇵🇭

Lumpia Lingo is a playful, Duolingo-inspired Tagalog learning web app. It works entirely in the browser, saves progress locally, and can optionally back up progress to a private Google Drive app-data folder.

## Highlights

- 100 lessons across 25 themes, each hosted by one of six characters (Lumpy, Tito Bong, Ate Crystal, Jetjet, Lola Joli, Tita Baby)
- Multiple-choice, typed translation, listening, sentence-building, matching, and speaking exercises
- Spaced-repetition Practice Hub: each word is scheduled by how you actually answered it — a first-try correct answer advances it, a first-try mistake brings it back soon
- Daily lesson streaks, a daily Wikipedia quiz, and a daily crossword
- Pre-generated audio for every word and sentence, plus an opt-in on-device Whisper model for speaking transcription
- A Gemini chat tutor for free-form Tagalog conversation (needs the small Flask backend in `server/`)
- Per-character lesson music: each host character has their own track, played quietly in the background and ducked while listening or speaking
- No gems, hearts, crowns, quests, or streak freezes
- Lumpy is the mascot. The interface uses a pastel Philippine-flag palette — sand background, beige cards, rose for errors. No dark mode, no blue anywhere.
- Mobile-friendly; installable from Chrome or Safari via **Add to Home Screen**

## Learning and pronunciation

Lessons are generated from the static catalog in `data/lessons.json` (100 lessons, 25 themes, 300 words), so the lesson side of the app runs without a backend.

Audio is pre-generated, not synthesized on the fly: `assets/audio/` holds ~1,478 edge-tts MP3 clips (Filipino voices) covering words and sentences, keyed by a content-addressed manifest. Speaking exercises transcribe the learner's recording with an opt-in on-device Whisper model (`whisper.js` / `whisper-worker.js`, downloaded only when enabled in Settings); otherwise transcription uses the cloud model. A handful of clips were hand-fixed where the TTS voice misread a word — check before regenerating audio.

## Lesson music

Each lesson plays its host character's track from `assets/music/` (one MP3 per host character), looped at a quiet background level. The track ducks while a speech clip plays or on a listening/speaking exercise, dims to 5% while the microphone is recording (it never pauses for the mic), and fades out over ~1.5 s when a lesson ends. Settings has a music toggle, a global mute, and a per-character preview.

## Progress sync

Progress is always saved locally in browser `localStorage`. Users can optionally connect Google Drive to create a private backup in the app's Drive app-data folder.

Cloud sync includes:

- Automatic sync after progress changes, when online
- Manual **Sync now** control
- Restore from Google Drive when starting on another device
- Conflict handling when local and cloud progress differ
- A local backup before restoring cloud progress
- Resume support for an unfinished lesson
- Offline operation: local saving continues if Google Drive is unavailable

The app requests only the Google Drive app-data scope, so it cannot browse or modify the rest of a user's Drive files. Sign-in uses an authorization-code flow; refresh tokens are stored per user in the server database, so the backup renews itself silently.

## Project structure

| File / folder | Purpose |
|---|---|
| `index.html` | App shell and main interface |
| `app.js` | Core learning app, state, navigation, and UI |
| `learning-flow.js` | Lesson flow and exercise sequencing |
| `lesson-progression.js` | Lesson locking and progression |
| `lesson-retries.js` | Lesson retry behaviour and double-answer guards |
| `lesson-numbering.js` | Lesson numbering |
| `lesson-music.js` | Per-character lesson music, ducking, mic dim, fade-out |
| `speaking.js` | Speaking exercises, recording, transcription routing |
| `answer-speech.js` | Speech clip playback (shared audio element) |
| `speech-routing.js` | Text-to-speech voice selection and routing |
| `pronunciation.js` | Tagalog pronunciation fallback (Abakada guide) |
| `sentence-builder.js` | Sentence-building exercises |
| `category-generator.js` | Lesson/category generation tooling |
| `review-core.js` | Practice Hub (SRS review) core |
| `review-conversations.js` | Review of saved chat conversations |
| `cloud-save.js` | Local storage and optional Google Drive sync |
| `daily-progress.js` | Daily streaks and Wikipedia quiz |
| `daily-crossword.js` | Daily crossword |
| `classic-rhymes.js` | Rhyme-based learning content |
| `characters.js` | Host character data |
| `mascots.js` | Mascot images and expressions |
| `whisper.js`, `whisper-worker.js` | Opt-in on-device Whisper transcription |
| `global-mute.js` | Global mute |
| `sound-effects.js` | Answer sound effects |
| `translation.js` | Translation support |
| `chat-notifications.js` | Chat notifications |
| `webpage-update.js` | Update check against the live version |
| `data/lessons.json` | Lesson content (100 lessons, 25 themes) |
| `data/rhymes.json` | Rhyme data |
| `assets/audio/` | Pre-generated pronunciation MP3s + manifest |
| `assets/music/` | One lesson-music MP3 per host character |
| `assets/characters/` | Lumpy and host-character art |
| `server/` | Flask + Gemini chat-tutor backend |
| `tests/` | Node test suite (run from the repo root) |

## Run locally

Lumpia Lingo is a static web app; no build step or package installation is required for lessons.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The chat tutor needs the backend: see `server/README.md` for the Flask app and its deploy script.

## Tests

```bash
node tests/lesson-music.test.cjs .
node tests/srs-speaking.test.cjs .
node tests/repro-stuck.cjs .
node tests/crossword-direction.test.cjs .
node tests/sound-effects.test.cjs .
node tests/characters.test.cjs .
node tests/continuous-thread-smoke.cjs review-conversations.js
node tests/webpage-update.test.cjs webpage-update.js
node tests/account-chat-v035.cjs .
```

## GitHub Pages

GitHub Pages publishes the app directly from the `main` branch, using the repository root as the site root.

## Privacy

Lumpia Lingo is designed for one user. It has no accounts, social leaderboards, analytics, or external user-data collection. Progress remains in browser storage unless the user explicitly connects Google Drive for private cloud backup.
