#!/usr/bin/env python3
"""data/episodes.json 에 새 에피소드를 추가한다.

사용 예:
    python3 scripts/add_episode.py new_episode.json
    python3 scripts/add_episode.py new_episode.json --dry-run

new_episode.json 은 에피소드 객체 하나(또는 그런 객체들의 배열)이며,
필수 키는 id, channel, title, cards 이다. date(원본 게시일)와
briefingDate(이 브리핑이 실리는 날) 중 하나는 있어야 하며,
briefingDate 가 없으면 date 를 쓴다.

같은 id 가 이미 있으면 덮어쓴다(같은 영상을 다시 정리했을 때).
channel 은 data/episodes.json 의 channels[].id 중 하나여야 한다.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "episodes.json"
KST = timezone(timedelta(hours=9))
REQUIRED = ("id", "channel", "title", "cards")


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(2)


def check_episode(ep, channel_ids):
    if not isinstance(ep, dict):
        fail("episode must be a JSON object")

    for key in REQUIRED:
        if not ep.get(key):
            fail(f"episode is missing required field: {key}")

    if channel_ids and ep["channel"] not in channel_ids:
        fail(f"unknown channel '{ep['channel']}' (known: {', '.join(sorted(channel_ids))})")

    if not ep.get("briefingDate") and not ep.get("date"):
        fail("episode needs date or briefingDate (YYYY-MM-DD)")
    if not ep.get("briefingDate"):
        ep["briefingDate"] = ep["date"]
    if not ep.get("date"):
        ep["date"] = ep["briefingDate"]

    cards = ep["cards"]
    if not isinstance(cards, list) or not cards:
        fail("episode.cards must be a non-empty array")
    for i, card in enumerate(cards):
        if not isinstance(card, dict):
            fail(f"cards[{i}] must be an object")
        if not card.get("title"):
            fail(f"cards[{i}] is missing title")
        if not card.get("body"):
            fail(f"cards[{i}] is missing body")
        if not isinstance(card["body"], list):
            fail(f"cards[{i}].body must be an array of paragraphs")
        for j, source in enumerate(card.get("sources") or []):
            if not isinstance(source, dict) or not source.get("url"):
                fail(f"cards[{i}].sources[{j}] needs a url")

    for i, q in enumerate(ep.get("quizzes") or []):
        if not isinstance(q, dict) or not q.get("question"):
            fail(f"quizzes[{i}] needs a question")
        if not isinstance(q.get("options"), list) or len(q["options"]) < 2:
            fail(f"quizzes[{i}].options needs at least 2 items")
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(q["options"]):
            fail(f"quizzes[{i}].answer must be an index into options")
        if q.get("type") not in (None, "choice", "ox"):
            fail(f"quizzes[{i}].type must be 'choice' or 'ox'")

    for i, r in enumerate(ep.get("reflections") or []):
        if not isinstance(r, dict) or not r.get("question"):
            fail(f"reflections[{i}] needs a question")
        if not r.get("id"):
            r["id"] = f"r{i + 1}"

    if not isinstance(ep.get("numbers") or [], list):
        fail("episode.numbers must be an array when present")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("episode_file", help="JSON file with one episode object (or an array of them)")
    parser.add_argument("--dry-run", action="store_true", help="validate and report without writing")
    parser.add_argument("--data", default=str(DATA), help="path to episodes.json")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        fail(f"data file not found: {data_path}")

    doc = json.loads(data_path.read_text(encoding="utf-8"))
    if isinstance(doc, list):
        doc = {"version": 2, "generatedAt": "", "channels": [], "episodes": doc}
    episodes = doc.setdefault("episodes", [])
    channels = doc.get("channels") or []
    channel_ids = {c.get("id") for c in channels if isinstance(c, dict) and c.get("id")}

    incoming = json.loads(Path(args.episode_file).read_text(encoding="utf-8"))
    if isinstance(incoming, dict):
        incoming = [incoming]
    if not isinstance(incoming, list) or not incoming:
        fail("episode file must contain an object or a non-empty array")

    for ep in incoming:
        check_episode(ep, channel_ids)

    by_id = {ep.get("id"): ep for ep in episodes}
    added, replaced = [], []
    for ep in incoming:
        if ep["id"] in by_id:
            replaced.append(ep["id"])
        else:
            added.append(ep["id"])
        by_id[ep["id"]] = ep

    merged = list(by_id.values())
    merged.sort(key=lambda e: (str(e.get("briefingDate", "")), str(e.get("date", ""))), reverse=True)
    doc["episodes"] = merged
    doc["generatedAt"] = datetime.now(KST).isoformat(timespec="seconds")

    if args.dry_run:
        print(json.dumps({"dryRun": True, "added": added, "replaced": replaced, "total": len(merged)}, ensure_ascii=False))
        return

    tmp = data_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, data_path)
    print(json.dumps({"added": added, "replaced": replaced, "total": len(merged)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
