# DUOLIBEE 🐝🇵🇭

A single-user, offline-first Tagalog learning web app with 60 lessons and Duolingo-style motivation.

## Learning features

- 60 lessons across 12 units
- Multiple choice, typed translation, listening, sentence building, and matching exercises
- Text-to-speech that prefers a detected Filipino/Tagalog device voice
- A curated pronunciation fallback for devices without a Filipino/Tagalog voice
- Voice status in Settings: native Tagalog speech or clearly labelled approximate fallback mode
- Spaced-repetition Practice Hub
- Crown levels for repeated lesson mastery

## Pronunciation approach

DUOLIBEE keeps standard Tagalog spelling on screen. When a device offers a Filipino or Tagalog system voice, the app sends the original Tagalog text directly to that voice.

When no such voice is installed, the app uses the lexicon in `pronunciation.js` to send a separate plain-text fallback to the device's default voice. The fallback steers generic voices toward Tagalog vowel targets, stress, `ng` /ŋ/, and `mga` /mɐŋa/ for common lesson words and phrases. It is labelled approximate because browser text-to-speech engines vary and cannot guarantee native-quality Tagalog. Installing a Filipino voice in your device settings gives the best result.

## Personal progression

- Daily XP goal and daily quests
- Streaks, streak freezes, and automatic streak repair
- Gems, hearts with timed regeneration, heart refills, and 2x XP boosts
- Achievements, personal weekly XP tracking, profile statistics, and confetti rewards
- Dark mode, adjustable speech rate, sound effects, and progress reset

## Accessibility and readability

- High-contrast dark-mode surfaces for lessons, answers, feedback, statistics, and toasts
- Clear active-state highlighting for the Learn, Practice, Quests, Profile, and Settings tabs
- Improved heading hierarchy, line height, card spacing, and prompt readability

## DUOLIBEE mascot assets

The app uses six transparent mascot PNGs from `assets/`:

| File | Used for |
|---|---|
| `assets/mascot-welcome.png` | Header, Learn hero, and profile |
| `assets/mascot-reminder.png` | Daily-goal and streak prompts |
| `assets/mascot-correct.png` | Correct-answer feedback |
| `assets/mascot-keep-going.png` | Practice Hub encouragement |
| `assets/mascot-celebration.png` | Session completion and achievements |
| `assets/mascot-sad.png` | Incorrect-answer feedback |

If an image cannot be loaded, DUOLIBEE shows a 🐝 fallback instead.

## Data and privacy

DUOLIBEE is designed for one user. There are no accounts, social leaderboards, analytics, or external user data. All progress is saved locally on your phone or computer using browser `localStorage`.

For the most reliable phone experience, open the GitHub Pages site in Chrome or Safari and choose **Add to Home Screen**. Avoid clearing site data if you want to preserve your streak and progress.

## Development

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## GitHub Pages

GitHub Pages publishes the static app directly from the `main` branch and `/ (root)` folder.