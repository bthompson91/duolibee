#!/usr/bin/env python3
"""Generate grammar notes for sentences in lessons.json that lack one.

Targeted follow-up to tools/gen-content.py: it only notes the sentences
that have no `n` field (the 125 new sentences from v0.39.21). One Gemini
call per theme, run on the VM where the backend key lives. Output is a
working JSON file {themes: [{name, sentence_notes: {sentence: note}}]},
written incrementally per theme, so a failure does not lose earlier themes.

Run on the VM (it reads the backend Gemini key):
    python3 tools/gen-sentence-notes.py --lessons data/lessons.json --out sentence-notes-gen.json
Key file: ~/.config/duolibee-chat/gemini.key (same file the backend uses).
Requires only the standard library (urllib).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

MODEL = "gemini-3.5-flash-lite"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def call_gemini(key, prompt, schema):
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 8192,
            "responseFormat": {
                "text": {"mimeType": "APPLICATION_JSON", "schema": schema}
            },
        },
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(f"Gemini connection error: {e}")
    cands = data.get("candidates", [])
    if len(cands) != 1 or cands[0].get("finishReason") != "STOP":
        raise RuntimeError(f"Gemini incomplete: finishReason={cands[0].get('finishReason') if cands else 'none'}")
    raw = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []) if not p.get("thought"))
    return json.loads(raw)


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["sentence_notes"],
    "properties": {
        "sentence_notes": {"type": "object", "additionalProperties": {"type": "string"}},
    },
}


def gen_theme(key, theme, missing, retries=2):
    sents = "\n".join(f"- {s['t']} = {s['e']}" for s in missing)
    prompt = (
        "You are writing lesson content for a beginner Tagalog app (Lumpia Lingo). "
        f"Theme: {theme['name']}. The learners are English speakers.\n\n"
        "SENTENCES (Tagalog = English):\n" + sents + "\n\n"
        "Return JSON with one field: sentence_notes, one note per sentence, keyed by the exact Tagalog sentence. "
        "1-2 sentences, plain English, under 280 characters. "
        "Explain what the grammar is doing: word order, the linker 'ay', polite 'po', verb forms, plural markers, or why the words are in that order. "
        "Do NOT guess at etymology — if unsure, explain meaning or usage instead. "
        "Never mention gems, hearts, crowns, quests or streaks."
    )
    last = None
    for attempt in range(retries + 1):
        try:
            out = call_gemini(key, prompt, SCHEMA)
        except Exception as e:
            last = e
            print(f"  {theme['name']}: attempt {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(5)
            continue
        notes = out.get("sentence_notes") or {}
        missing_t = [s["t"] for s in missing if s["t"] not in notes]
        bad = [t for t, n in notes.items() if not n or len(n) > 280]
        if missing_t or bad:
            last = RuntimeError(f"missing={missing_t} bad={bad}")
            print(f"  {theme['name']}: {last}; retrying", file=sys.stderr)
            time.sleep(5)
            continue
        return {"name": theme["name"], "sentence_notes": notes}
    raise RuntimeError(f"{theme['name']}: all attempts failed: {last}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--out", default="sentence-notes-gen.json")
    ap.add_argument("--key-file", default="~/.config/duolibee-chat/gemini.key")
    ap.add_argument("--resume", action="store_true", help="resume from an existing --out file")
    ap.add_argument("--theme", default=None, help="only generate this one theme (test)")
    args = ap.parse_args()
    key = open(os.path.expanduser(args.key_file), encoding="utf-8").read().strip()
    if not key:
        raise SystemExit("empty key file")
    data = json.load(open(args.lessons, encoding="utf-8"))
    gen = {"themes": []}
    done = set()
    if args.resume:
        try:
            gen = json.load(open(args.out, encoding="utf-8"))
            done = {g["name"] for g in gen["themes"]}
            print(f"resuming: {len(done)} themes already done")
        except FileNotFoundError:
            pass
    n_total = 0
    for theme in data["themes"]:
        if args.theme and theme["name"] != args.theme:
            continue
        if theme["name"] in done:
            continue
        missing = [s for s in theme["sentences"] if "n" not in s]
        n_total += len(missing)
        if not missing:
            print(f"{theme['name']}: no sentences lacking notes, skipping")
            continue
        print(f"generating {theme['name']} ({len(missing)} notes) ...", flush=True)
        g = gen_theme(key, theme, missing)
        gen["themes"].append(g)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(gen, f, ensure_ascii=False, indent=1)
        print(f"  done ({len(g['sentence_notes'])} notes)", flush=True)
        time.sleep(5)  # stay under the free-tier per-minute quota
    n_notes = sum(len(g["sentence_notes"]) for g in gen["themes"])
    print(f"themes: {len(gen['themes'])}  notes: {n_notes}  sentences lacking notes: {n_total}")


if __name__ == "__main__":
    main()
