#!/usr/bin/env python3
"""Generate pre-recorded Tagalog audio for every lesson phrase.

Each spoken phrase in data/lessons.json is synthesized once with edge-tts
(free, no key) using the voice settings for the character who says it, and
saved under assets/audio/ with a content-addressed filename. The app plays
these files instead of calling a TTS service at runtime.

Words are spoken in the lesson host's voice; sentences in their speaker's
voice (the `speaker` field on each sentence).

Voice settings live in VOICE_MAP below. To re-voice a character, change the
map and re-run: files are named by a hash of (text, voice, rate, pitch), so
changed settings produce new files and the manifest is rewritten. Re-running
without --force skips files that already exist, so adding new lessons only
generates the new phrases.

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

VOICE_MAP = {
    "lumpy":       ("fil-PH-AngeloNeural",   "+0%",  "+0Hz"),
    "tito-bong":   ("fil-PH-AngeloNeural",   "-15%", "-15Hz"),
    "tita-baby":   ("fil-PH-BlessicaNeural", "+0%",  "+0Hz"),
    "ate-crystal": ("fil-PH-BlessicaNeural", "+15%", "+15Hz"),
    "jetjet":      ("fil-PH-AngeloNeural",   "+5%",  "+30Hz"),
    "lola-joli":   ("fil-PH-BlessicaNeural", "-28%", "-5Hz"),
}

CONCURRENCY = 8


def file_name(text, voice, rate, pitch):
    h = hashlib.sha256(f"{text}\n{voice}\n{rate}\n{pitch}".encode("utf-8")).hexdigest()
    return h[:16] + ".mp3"


def collect(lessons_path):
    with open(lessons_path, encoding="utf-8") as f:
        data = json.load(f)
    pairs = {}  # (text, character) -> filename
    for theme in data["themes"]:
        host = theme["host"]
        for item in theme["items"]:
            pairs[(item["t"], host)] = None
        for s in theme["sentences"]:
            pairs[(s["t"], s["speaker"])] = None
    for (text, char) in pairs:
        voice, rate, pitch = VOICE_MAP[char]
        pairs[(text, char)] = file_name(text, voice, rate, pitch)
    return pairs


async def generate_one(sem, text, char, fname, out_dir, force):
    path = os.path.join(out_dir, fname)
    if os.path.exists(path) and not force:
        return "skipped"
    voice, rate, pitch = VOICE_MAP[char]
    async with sem:
        c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await c.save(path)
    return "generated"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--out", default="assets/audio")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    pairs = collect(args.lessons)
    sem = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*[
        generate_one(sem, text, char, fname, args.out, args.force)
        for (text, char), fname in pairs.items()
    ])
    gen = results.count("generated")
    skip = results.count("skipped")
    manifest = {
        "version": 1,
        "generated": date.today().isoformat(),
        "entries": {f"{char}|{text}": fname for (text, char), fname in sorted(pairs.items())},
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(args.out, fn)) for fn in set(pairs.values()))
    print(f"phrases: {len(pairs)}  files: {len(set(pairs.values()))}  generated: {gen}  skipped: {skip}")
    print(f"total size: {total / 1024:.0f} KB  manifest: {os.path.join(args.out, 'manifest.json')}")


if __name__ == "__main__":
    asyncio.run(main())
