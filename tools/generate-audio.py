#!/usr/bin/env python3
"""Generate pre-recorded lesson audio for every lesson phrase.

Each spoken phrase in data/lessons.json is synthesized once with edge-tts
(free, no key) using the voice settings for the character who says it, and
saved under assets/audio/ with a content-addressed filename. The app plays
these files instead of calling a TTS service at runtime.

Words are spoken in the lesson host's voice; sentences in their speaker's
voice (the `speaker` field on each sentence). The build exercise shows each
sentence as tappable word tokens, so every individual sentence word is also
generated in its sentence's speaker's voice (Tagalog only — no UI speaks
English sentence words individually). Tokens carry trailing punctuation
("ka?", "tulong."), so the word is stored stripped of it; the app's lookup
tries the raw token first, then the normalized word, which matches.

Both languages are generated:
  * Tagalog (tl): the fil-PH voices, one per character.
  * English (en): the English meanings/translations. Lumpy, Tito Bong,
    Tita Baby and Lola Joli speak English in their own Filipino voices
    (Angelo/Blessica); Ate Crystal and Jetjet use en-US neural voices
    (Aria/Guy). All keep the same per-character rate/pitch tweaks as the
    Tagalog clips.

Voice settings live in CHAR_SETTINGS / TL_VOICES / EN_VOICES below. To
re-voice a character, change the maps and re-run: files are named by a hash
of (text, voice, rate, pitch), so changed settings produce new files and
the manifest is rewritten. Re-running without --force skips files that
already exist, so adding new lessons only generates the new phrases.

The manifest is version 2: keys are "character|tl|text" / "character|en|text".
The file hash deliberately does NOT include the language, so an identical
text spoken by the same voice/settings (e.g. the name "Ana") reuses one file.

Run on a machine with direct internet access (edge-tts opens a websocket to
speech.platform.bing.com; sandboxes behind a MITM egress proxy strip the
`Connection: upgrade` header the handshake needs, so generate on the VM):
    python3 tools/generate-audio.py --lessons data/lessons.json --out assets/audio

Requires: pip install edge-tts
"""
import argparse
import asyncio
import hashlib
import json
import os
from datetime import date

import edge_tts

# Per-character speed/pitch tweaks (the settings Brendan approved, 2026-11-19).
CHAR_SETTINGS = {
    "lumpy":       ("+0%",  "+0Hz"),
    "tito-bong":   ("-15%", "-15Hz"),
    "tita-baby":   ("+0%",  "+0Hz"),
    "ate-crystal": ("+15%", "+15Hz"),
    "jetjet":      ("+5%",  "+30Hz"),
    "lola-joli":   ("-28%", "-5Hz"),
}

# Tagalog voices: the only two fil-PH voices edge-tts ships.
TL_VOICES = {
    "lumpy": "fil-PH-AngeloNeural",
    "tito-bong": "fil-PH-AngeloNeural",
    "tita-baby": "fil-PH-BlessicaNeural",
    "ate-crystal": "fil-PH-BlessicaNeural",
    "jetjet": "fil-PH-AngeloNeural",
    "lola-joli": "fil-PH-BlessicaNeural",
}

# English voices (Brendan's call, 2026-11-19, after hearing the fil-PH voices
# read English): Lumpy, Tito Bong, Tita Baby and Lola Joli speak English in
# their own Filipino voices (Angelo/Blessica), so the English sounds like
# them. Ate Crystal and Jetjet keep the en-US voices already generated
# (Aria/Guy) — those files are reused as-is, only the four change.
EN_VOICES = {
    "lumpy": "fil-PH-AngeloNeural",
    "tito-bong": "fil-PH-AngeloNeural",
    "tita-baby": "fil-PH-BlessicaNeural",
    "ate-crystal": "en-US-AriaNeural",
    "jetjet": "en-US-GuyNeural",
    "lola-joli": "fil-PH-BlessicaNeural",
}

CONCURRENCY = 8


def file_name(text, voice, rate, pitch):
    h = hashlib.sha256(f"{text}\n{voice}\n{rate}\n{pitch}".encode("utf-8")).hexdigest()
    return h[:16] + ".mp3"


def collect(lessons_path):
    """Return {(text, character, lang): filename} for every spoken phrase."""
    with open(lessons_path, encoding="utf-8") as f:
        data = json.load(f)
    pairs = {}  # (text, character, lang) -> filename
    for theme in data["themes"]:
        host = theme["host"]
        for item in theme["items"]:
            for text, lang in ((item["t"], "tl"), (item["e"], "en")):
                if text:
                    pairs[(text, host, lang)] = None
        for s in theme["sentences"]:
            speaker = s.get("speaker") or host
            for text, lang in ((s["t"], "tl"), (s["e"], "en")):
                if text:
                    pairs[(text, speaker, lang)] = None
            # Individual words of the sentence, in the speaker's voice:
            # the build exercise shows each word as a tappable token.
            # Tokens carry trailing punctuation ("ka?", "tulong."), so
            # strip it — the app looks the normalized word up.
            for tok in (s["t"] or "").split(" "):
                word = tok.strip("?.,!;:'\"()")
                if word:
                    pairs[(word, speaker, "tl")] = None
    for (text, char, lang) in pairs:
        rate, pitch = CHAR_SETTINGS[char]
        voice = (TL_VOICES if lang == "tl" else EN_VOICES)[char]
        pairs[(text, char, lang)] = file_name(text, voice, rate, pitch)
    return pairs


async def generate_one(sem, text, char, lang, fname, out_dir, force):
    path = os.path.join(out_dir, fname)
    if os.path.exists(path) and not force:
        return "skipped"
    rate, pitch = CHAR_SETTINGS[char]
    voice = (TL_VOICES if lang == "tl" else EN_VOICES)[char]
    async with sem:
        c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await c.save(path)
    return "generated"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--out", default="assets/audio")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--prune", action="store_true",
                    help="delete .mp3 files in --out that the new manifest no longer references")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    pairs = collect(args.lessons)
    sem = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*[
        generate_one(sem, text, char, lang, fname, args.out, args.force)
        for (text, char, lang), fname in pairs.items()
    ])
    gen = results.count("generated")
    skip = results.count("skipped")
    manifest = {
        "version": 2,
        "generated": date.today().isoformat(),
        "entries": {f"{char}|{lang}|{text}": fname
                    for (text, char, lang), fname in sorted(pairs.items())},
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(args.out, fn)) for fn in set(pairs.values()))
    print(f"phrases: {len(pairs)}  files: {len(set(pairs.values()))}  generated: {gen}  skipped: {skip}")
    print(f"total size: {total / 1024:.0f} KB  manifest: {os.path.join(args.out, 'manifest.json')}")
    if args.prune:
        referenced = set(pairs.values())
        pruned = 0
        for fn in os.listdir(args.out):
            if fn.endswith(".mp3") and fn not in referenced:
                os.remove(os.path.join(args.out, fn))
                pruned += 1
        print(f"pruned {pruned} orphaned files")


if __name__ == "__main__":
    asyncio.run(main())
