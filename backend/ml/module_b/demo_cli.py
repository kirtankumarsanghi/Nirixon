"""Try the live flow.

Interactive:   python src/demo_cli.py --age 9 --text "He cannot sit through homework and forgets everything"
Scripted demo: python src/demo_cli.py --age 9 --text "..." --auto attention_work=0.85,emotion_school=0.6
               (--auto simulates a parent whose child is concerning in the listed domains)
"""

import argparse
import os
import random
import sys

import numpy as np

SEED = 42
os.environ["PYTHONHASHSEED"] = str(SEED)
random.seed(SEED)
np.random.seed(SEED)

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT / "app" / "core" / "module_b"))
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, os.path.dirname(__file__))
try:
    from app.core.module_b.engine_b import Engine
    from app.core.module_b.router_b import DomainRouter
except ImportError:
    from engine_b import Engine
    from router_b import DomainRouter


def auto_answer(row_track, row, sev, rng):
    """Simulated parent: answer around the child's severity for that track."""
    s = sev.get(row_track, 0.08)
    if row["response_type"] == "yesno":
        return "Yes" if rng.random() < s else "No"
    c = min(1, max(0, rng.gauss(s, 0.18)))
    if int(row["reverse_scored"]) == 1:
        c = 1 - c
    return round(1 + 4 * c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--age", type=int, default=8)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--auto", default="")
    a = ap.parse_args()
    router_path = str(
        BACKEND_ROOT / "ml" / "artifacts" / "module_b_router" / "router_b.joblib"
    )
    if not os.path.exists(router_path):
        router_path = str(BACKEND_ROOT / "artifacts" / "router_b.joblib")
    router = DomainRouter.load(router_path)
    eng = Engine(router)
    s = eng.start(a.text, a.age, seed=a.seed)
    r = router.route(a.text)
    print(
        "ROUTER  flagged:",
        [l for l in r.flagged],
        "| unclear:",
        r.unclear,
        "| safety:",
        r.safety,
    )
    print(
        "PRIORS ",
        {
            k: round(v, 2)
            for k, v in sorted(s.prior.items(), key=lambda x: -x[1])
            if v > 0.1
        },
    )
    sev = {k: float(v) for k, v in (p.split("=") for p in a.auto.split(",") if p)}
    rng = random.Random(a.seed)
    while True:
        act = eng.next_action(s)
        if act["type"] == "safety_notice":
            print("\n[SAFETY NOTICE]", act["message"])
            continue
        if act["type"] == "recall_help":
            print("\n[RECALL HELP] text unclear; options:", list(act["options"]))
            eng.apply_recall_choice(s, list(sev) or ["attention_work"])
            continue
        if act["type"] == "done":
            break
        row = eng.bank.row(act["item_id"])
        n = act["progress"]["answered"] + 1
        if a.auto:
            val = auto_answer(act["track"], row, sev, rng)
            print(f"Q{n:02d} [{act['track']:<20}] {act['text']}\n      -> {val}")
        else:
            print(f"\nQ{n}. {act['text']}\n   scale: {act['scale']}")
            val = input("   answer> ").strip()
            val = int(val) if act["response_type"] == "likert5" else val
        eng.answer(s, act["item_id"], val, track=act["track"])
    res = eng.result(s)
    print("\n=== RESULT ===")
    print(res["summary"])
    for d, v in res["domains"].items():
        print(
            f"  {d:20s} {v['state']:24s} score={v['score']:.2f} n={v['n']}"
            + ("  (borderline)" if v.get("borderline") else "")
        )
    for d, v in res["ruleouts"].items():
        print(f"  {d:20s} {v['state']:24s} n={v['n']}")
    for d, acts in res["activities"].items():
        print(f"  activities for {d}: " + " | ".join(x["title"] for x in acts))


if __name__ == "__main__":
    main()
