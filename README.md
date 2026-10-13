# DUOLIBEE 🐝🇵🇭

A playful, Duolingo-inspired web app for learning Tagalog, with 60 bite-sized lessons.

## Features

- 60 lessons across 12 themed units
- Multiple-choice and type-the-translation exercises
- XP, daily streak tracking, hearts, and lesson completion
- Progress saved in the browser with `localStorage`
- No build step, backend, or dependencies

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

The included GitHub Actions workflow deploys the static site to GitHub Pages. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** if Pages does not start automatically.
