#!/usr/bin/env python3
"""Merge sentence notes into lessons.json (targeted follow-up).

Adds an `n` field to exactly the sentences that lack one (the 125 new
sentences from v0.39.21). Touches nothing else: existing notes, words,
variants, sentence text/translations/speakers are all left alone.

Validates: all 200 sentences end up with a note; no sentence text changed;
every pre-existing note is byte-identical after the merge.

Usage:
    python3 tools/merge-sentence-notes.py --lessons data/lessons.json --gen sentence-notes-gen.json
Writes lessons.json in the file's existing compact single-line format
(no trailing newline).
"""
import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", default="data/lessons.json")
    ap.add_argument("--gen", default="sentence-notes-gen.json")
    ap.add_argument("--out", default=None, help="default: overwrite --lessons")
    args = ap.parse_args()
    data = json.load(open(args.lessons, encoding="utf-8"))
    gen = json.load(open(args.gen, encoding="utf-8"))
    gen_by_name = {g["name"]: g for g in gen["themes"]}

    # Snapshot everything that must not change.
    before = {}
    for th in data["themes"]:
        for s in th["sentences"]:
            before[(th["name"], s["t"])] = (s.get("e"), s.get("speaker"), s.get("n"))

    n_added = 0
    problems = []
    for th in data["themes"]:
        g = gen_by_name.get(th["name"])
        notes = (g or {}).get("sentence_notes") or {}
        for s in th["sentences"]:
            if "n" in s:
                continue
            note = notes.get(s["t"])
            if not note:
                problems.append(f"no note for {s['t']!r} in {th['name']}")
            else:
                s["n"] = note
                n_added += 1

    # Validate: all 200 sentences have a note; nothing else changed.
    total = 0
    with_n = 0
    for th in data["themes"]:
        for s in th["sentences"]:
            total += 1
            if "n" in s:
                with_n += 1
            old = before.get((th["name"], s["t"]))
            if old is None:
                problems.append(f"new sentence appeared: {s['t']!r}")
            elif (s.get("e"), s.get("speaker")) != (old[0], old[1]):
                problems.append(f"sentence text changed: {s['t']!r}")
            elif old[2] is not None and s.get("n") != old[2]:
                problems.append(f"existing note changed: {s['t']!r}")
    if total != 200:
        problems.append(f"expected 200 sentences, got {total}")
    if with_n != 200:
        problems.append(f"expected 200 sentences with notes, got {with_n}")

    out_path = args.out or args.lessons
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"notes added: {n_added}  sentences with notes: {with_n}/{total}")
    if problems:
        print("PROBLEMS:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        raise SystemExit(1)
    print("merge OK")


if __name__ == "__main__":
    main()
