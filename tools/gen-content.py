#!/usr/bin/env python3
"""Generate pre-written lesson content for Lumpia Lingo with Gemini.

One Gemini call per theme (25 calls), run on the VM where the backend key
lives. Produces a working JSON file with, per theme:
  * word_notes: {word Tagalog: note} for every word (1-2 sentences, plain English)
  * sentence_notes: {sentence Tagalog: note} for every sentence
  * new_sentences: 5 new beginner sentences {t, e, speaker}
  * variants: {word Tagalog: [alternate spellings]} (0-4, only genuine ones)

The output is validated (all themes, all notes present, 5 new sentences,
valid speakers, variants checked against norm() collisions) and written
incrementally per theme, so a failure does not lose earlier themes.

Run on the VM (it reads the backend Gemini key):
    python3 tools/gen-content.py --lessons data/lessons.json --out content-gen.json
Key file: ~/.config/duolibee-chat/gemini.key (same file the backend uses).
Requires only the standard library (urllib).
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

MODEL = "gemini-3.5-flash-lite"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
CHARACTERS = ["lumpy", "tito-bong", "tita-baby", "ate-crystal", "jetjet", "lola-joli"]


def norm(s):
    """Mirror app.js norm(): lowercase, strip accents, drop punctuation, collapse spaces."""
    s = str(s).lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


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
    "required": ["word_notes", "sentence_notes", "new_sentences", "variants"],
    "properties": {
        "word_notes": {"type": "object", "additionalProperties": {"type": "string"}},
        "sentence_notes": {"type": "object", "additionalProperties": {"type": "string"}},
        "new_sentences": {
            "type": "array", "minItems": 5, "maxItems": 5,
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["t", "e", "speaker"],
                "properties": {
                    "t": {"type": "string"},
                    "e": {"type": "string"},
                    "speaker": {"type": "string", "enum": CHARACTERS},
                },
            },
        },
        "variants": {
            "type": "object",
            "additionalProperties": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
        },
    },
}


def theme_prompt(theme, all_words):
    words = "\n".join(f"- {it['t']} = {it['e']}" for it in theme["items"])
    sents = "\n".join(f"- {s['t']} = {s['e']}" for s in theme["sentences"])
    return (
        "You are writing lesson content for a beginner Tagalog app (Lumpia Lingo). "
        f"Theme: {theme['name']}. The learners are English speakers.\n\n"
        "WORDS (Tagalog = English):\n" + words + "\n\n"
        "SENTENCES (Tagalog = English):\n" + sents + "\n\n"
        "Return JSON with four fields.\n\n"
        "1. word_notes: one note per word, keyed by the exact Tagalog word. 1-2 sentences, plain English, under 280 characters. "
        "Explain a meaning nuance, a usage tip, or (only if you are confident) the word's origin. "
        "Do NOT guess at etymology — if unsure, explain meaning or usage instead. "
        "Never mention gems, hearts, crowns, quests or streaks.\n\n"
        "2. sentence_notes: one note per sentence, keyed by the exact Tagalog sentence. 1-2 sentences, plain English, under 280 characters. "
        "Explain what the grammar is doing: word order, the linker 'ay', polite 'po', verb forms, or why the words are in that order.\n\n"
        "3. new_sentences: exactly 5 NEW beginner sentences for this theme, each with Tagalog (t), correct English (e), and a speaker. "
        "Natural everyday Tagalog at the same level as the examples. Do not repeat the existing sentences. "
        "Vary the speaker across the 5 (use several of: lumpy, tito-bong, tita-baby, ate-crystal, jetjet, lola-joli).\n\n"
        "4. variants: for each word that has genuine alternate spellings, list 0-4 variants. "
        "A variant is a spelling a learner might type or a speech recogniser might produce: a common misspelling, a dropped vowel, a Spanish-derived spelling, or a form without an accent. "
        "Do NOT include a form that differs from the word only by capitalisation or accents (those are already handled). "
        "Do NOT include a form that is itself another word in the full word list below. "
        "Only include genuine variants; leave a word out entirely if it has none.\n\n"
        "FULL WORD LIST (do not use any of these as a variant):\n" + ", ".join(all_words) + "\n"
    )


def fill_missing_notes(key, theme, out):
    """Targeted call for just the words/sentences whose notes are missing."""
    missing_w = [it for it in theme["items"] if it["t"] not in (out.get("word_notes") or {})]
    missing_s = [s for s in theme["sentences"] if s["t"] not in (out.get("sentence_notes") or {})]
    if not missing_w and not missing_s:
        return out
    parts = []
    if missing_w:
        parts.append("WORDS:\n" + "\n".join(f"- {it['t']} = {it['e']}" for it in missing_w))
    if missing_s:
        parts.append("SENTENCES:\n" + "\n".join(f"- {s['t']} = {s['e']}" for s in missing_s))
    prompt = (
        "You are writing lesson content for a beginner Tagalog app. "
        "Write a 1-2 sentence note in plain English (under 280 characters) for EACH item below. "
        "For a word: a meaning nuance, a usage tip, or (only if confident) its origin — do not guess at etymology. "
        "For a sentence: what the grammar is doing (word order, the linker 'ay', polite 'po', verb forms). "
        "Never mention gems, hearts, crowns, quests or streaks. "
        "Return JSON with word_notes and sentence_notes keyed by the exact Tagalog text.\n\n" + "\n\n".join(parts)
    )
    schema = {
        "type": "object", "additionalProperties": False,
        "required": ["word_notes", "sentence_notes"],
        "properties": {
            "word_notes": {"type": "object", "additionalProperties": {"type": "string"}},
            "sentence_notes": {"type": "object", "additionalProperties": {"type": "string"}},
        },
    }
    filled = call_gemini(key, prompt, schema)
    out.setdefault("word_notes", {}).update(filled.get("word_notes") or {})
    out.setdefault("sentence_notes", {}).update(filled.get("sentence_notes") or {})
    return out


def gen_theme(key, theme, all_words, retries=2):
    prompt = theme_prompt(theme, all_words)
    last = None
    out = None
    for attempt in range(retries + 1):
        try:
            out = call_gemini(key, prompt, SCHEMA)
        except Exception as e:
            last = e
            print(f"  {theme['name']}: attempt {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(5)
            continue
        # Missing notes: fill them with a targeted call instead of failing.
        missing_w = [it["t"] for it in theme["items"] if it["t"] not in (out.get("word_notes") or {})]
        missing_s = [s["t"] for s in theme["sentences"] if s["t"] not in (out.get("sentence_notes") or {})]
        if missing_w or missing_s:
            print(f"  {theme['name']}: missing notes words={missing_w} sentences={missing_s}; filling", file=sys.stderr)
            try:
                out = fill_missing_notes(key, theme, out)
            except Exception as e:
                last = e
                print(f"  {theme['name']}: fill failed: {e}", file=sys.stderr)
                time.sleep(5)
                continue
        missing_w = [it["t"] for it in theme["items"] if it["t"] not in (out.get("word_notes") or {})]
        missing_s = [s["t"] for s in theme["sentences"] if s["t"] not in (out.get("sentence_notes") or {})]
        if missing_w or missing_s:
            last = RuntimeError(f"missing notes words={missing_w} sentences={missing_s}")
            time.sleep(5)
            continue
        break
    else:
        raise RuntimeError(f"{theme['name']}: all attempts failed: {last}")
    if out is None:
        raise RuntimeError(f"{theme['name']}: no output: {last}")
    ns = out.get("new_sentences") or []
    if len(ns) != 5:
        raise RuntimeError(f"{theme['name']}: expected 5 new sentences, got {len(ns)}")
    for s in ns:
        if not s.get("t") or not s.get("e") or s.get("speaker") not in CHARACTERS:
            raise RuntimeError(f"{theme['name']}: bad new sentence {s}")
    return {
        "name": theme["name"],
        "word_notes": out["word_notes"],
        "sentence_notes": out["sentence_notes"],
        "new_sentences": ns,
        "variants": out.get("variants") or {},
    }


def validate_all(data, gen):
    """Cross-theme checks: no duplicate new sentences, variant collisions."""
    existing_t = {norm(it["t"]) for th in data["themes"] for it in th["items"]}
    existing_s = {norm(s["t"]) for th in data["themes"] for s in th["sentences"]}
    seen_new = set()
    problems = []
    for g in gen["themes"]:
        for s in g["new_sentences"]:
            n = norm(s["t"])
            if n in existing_s:
                problems.append(f"new sentence duplicates existing: {s['t']!r}")
            if n in seen_new:
                problems.append(f"new sentence duplicated: {s['t']!r}")
            seen_new.add(n)
    # Variant collisions: a variant must not equal (after norm) any word,
    # any other variant, or its own word. Drop colliding variants.
    seen_variants = {}  # norm -> (theme, word)
    dropped = 0
    for g in gen["themes"]:
        for word, vs in list(g["variants"].items()):
            keep = []
            for v in vs:
                nv = norm(v)
                if not nv or nv == norm(word):
                    dropped += 1
                    continue
                if nv in existing_t:
                    problems.append(f"variant {v!r} for {word!r} collides with word {nv!r}; dropped")
                    dropped += 1
                    continue
                if nv in seen_variants:
                    problems.append(f"variant {v!r} for {word!r} collides with variant for {seen_variants[nv]!r}; dropped")
                    dropped += 1
                    continue
                seen_variants[nv] = (g["name"], word)
                keep.append(v)
            if keep:
                g["variants"][word] = keep
            else:
                g["variants"].pop(word, None)
    # Notes present for all 375.
    n_notes = sum(len(g["word_notes"]) + len(g["sentence_notes"]) for g in gen["themes"])
    return problems, dropped, n_notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--out", default="content-gen.json")
    ap.add_argument("--key-file", default="~/.config/duolibee-chat/gemini.key")
    ap.add_argument("--resume", action="store_true", help="resume from an existing --out file")
    ap.add_argument("--theme", default=None, help="only generate this one theme (test)")
    args = ap.parse_args()
    key = open(os.path.expanduser(args.key_file), encoding="utf-8").read().strip()
    if not key:
        raise SystemExit("empty key file")
    data = json.load(open(args.lessons, encoding="utf-8"))
    all_words = [it["t"] for th in data["themes"] for it in th["items"]]
    gen = {"themes": []}
    done = set()
    if args.resume:
        try:
            gen = json.load(open(args.out, encoding="utf-8"))
            done = {g["name"] for g in gen["themes"]}
            print(f"resuming: {len(done)} themes already done")
        except FileNotFoundError:
            pass
    for theme in data["themes"]:
        if args.theme and theme["name"] != args.theme:
            continue
        if theme["name"] in done:
            continue
        print(f"generating {theme['name']} ...", flush=True)
        g = gen_theme(key, theme, all_words)
        gen["themes"].append(g)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(gen, f, ensure_ascii=False, indent=1)
        print(f"  done ({len(g['word_notes'])} word notes, {len(g['sentence_notes'])} sentence notes, "
              f"{len(g['new_sentences'])} new sentences, {len(g['variants'])} words with variants)", flush=True)
    problems, dropped, n_notes = validate_all(data, gen)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(gen, f, ensure_ascii=False, indent=1)
    n_new = sum(len(g["new_sentences"]) for g in gen["themes"])
    n_var_words = sum(len(g["variants"]) for g in gen["themes"])
    n_vars = sum(len(vs) for g in gen["themes"] for vs in g["variants"].values())
    print(f"themes: {len(gen['themes'])}  notes: {n_notes}  new sentences: {n_new}  "
          f"words with variants: {n_var_words}  variants: {n_vars}  dropped colliding variants: {dropped}")
    if problems:
        print("VALIDATION PROBLEMS:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)


if __name__ == "__main__":
    main()
