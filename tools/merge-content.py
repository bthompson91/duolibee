#!/usr/bin/env python3
"""Merge generated content (notes, new sentences, variants) into lessons.json.

Reads the working output of tools/gen-content.py and merges it:
  * word_notes / sentence_notes -> `n` on each original word/sentence
    (only keys that exactly match an existing t; orphan keys are dropped).
  * new_sentences -> appended to each theme's sentences array.
  * variants -> merged into each word's `v` (existing v preserved, new
    variants appended, deduped, re-checked for norm() collisions).

Validates: all 300 words + 75 original sentences get a note, 200 sentences
total, no duplicate sentences, no variant collisions. Writes lessons.json
in the file's existing compact single-line format (no trailing newline).

Usage:
    python3 tools/merge-content.py --lessons data/lessons.json --gen content-gen.json
"""
import argparse
import json
import re
import sys
import unicodedata


def norm(s):
    s = str(s).lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--gen", default="content-gen.json")
    ap.add_argument("--out", default=None, help="default: overwrite --lessons")
    args = ap.parse_args()
    data = json.load(open(args.lessons, encoding="utf-8"))
    gen = json.load(open(args.gen, encoding="utf-8"))
    gen_by_name = {g["name"]: g for g in gen["themes"]}

    n_notes = 0
    n_new = 0
    n_var_words = 0
    n_vars = 0
    problems = []

    # Index all words (norm) for collision checks.
    all_word_norms = {norm(it["t"]) for th in data["themes"] for it in th["items"]}
    seen_variant_norms = set()
    for th in data["themes"]:
        g = gen_by_name.get(th["name"])
        if g is None:
            problems.append(f"theme {th['name']!r} missing from gen file")
            continue
        for it in th["items"]:
            note = (g.get("word_notes") or {}).get(it["t"])
            if not note:
                problems.append(f"no word note for {it['t']!r} in {th['name']}")
            else:
                it["n"] = note
                n_notes += 1
            vs = (g.get("variants") or {}).get(it["t"]) or []
            if vs:
                existing = list(it.get("v") or [])
                existing_norms = {norm(v) for v in existing}
                for v in vs:
                    nv = norm(v)
                    if not nv or nv == norm(it["t"]) or nv in existing_norms:
                        continue
                    if nv in all_word_norms:
                        problems.append(f"variant {v!r} for {it['t']!r} collides with a word; skipped")
                        continue
                    if nv in seen_variant_norms:
                        problems.append(f"variant {v!r} for {it['t']!r} collides with another variant; skipped")
                        continue
                    seen_variant_norms.add(nv)
                    existing.append(v)
                    n_vars += 1
                if existing:
                    it["v"] = existing
                    n_var_words += 1
        for s in th["sentences"]:
            note = (g.get("sentence_notes") or {}).get(s["t"])
            if not note:
                problems.append(f"no sentence note for {s['t']!r} in {th['name']}")
            else:
                s["n"] = note
                n_notes += 1
        for s in g.get("new_sentences") or []:
            th["sentences"].append({"t": s["t"], "e": s["e"], "speaker": s["speaker"]})
            n_new += 1

    # Final checks.
    total_sents = sum(len(th["sentences"]) for th in data["themes"])
    seen_s = set()
    for th in data["themes"]:
        for s in th["sentences"]:
            n = norm(s["t"])
            if n in seen_s:
                problems.append(f"duplicate sentence: {s['t']!r}")
            seen_s.add(n)
    if total_sents != 200:
        problems.append(f"expected 200 sentences, got {total_sents}")

    out_path = args.out or args.lessons
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"notes: {n_notes}  new sentences: {n_new}  words with variants: {n_var_words}  variants: {n_vars}")
    if problems:
        print("PROBLEMS:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        raise SystemExit(1)
    print("merge OK")


if __name__ == "__main__":
    main()
