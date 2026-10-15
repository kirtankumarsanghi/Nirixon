"""Does the text actually make the questioning better?  (plumbing + policy comparison)

For each note (hand-written + unseen generator texts) we know the true domains. A simulated
parent answers around a per-domain severity. We compare three policies on the SAME simulated
children and the SAME seeds:

  full      : router priors + adaptive loop           (the real system)
  no_text   : uniform priors, adaptive loop           (what you get without the NLP step)
  oracle    : priors = the true domains                (upper bound for what a perfect router could do)

IMPORTANT: answers come from MY assumed response model, so this measures whether the machinery
finds the right domains efficiently - NOT clinical accuracy. Real validation needs real parents
and clinician-rated outcomes.
Run: python src/simulate_sessions.py [--n-gen 600 --reps 3]
"""
import argparse
import json
import os, random
import sys

SEED = 42
os.environ["PYTHONHASHSEED"] = str(SEED)
random.seed(SEED)

import numpy as np
np.random.seed(SEED)
import pandas as pd

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODULE_B_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_ROOT / "app" / "core" / "module_b"))
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(MODULE_B_DIR))
try:
    from app.core.module_b.engine_b import Engine, DOMAINS, RULEOUTS
    from app.core.module_b.router_b import DomainRouter
except ImportError:
    from engine_b import Engine, DOMAINS, RULEOUTS
    from router_b import DomainRouter


def simulate_answer(row, track, sev, rng):
    s = sev.get(track, 0.07)
    if row["response_type"] == "yesno":
        return "Yes" if rng.random() < s * 0.6 else "No"
    c = min(1.0, max(0.0, rng.gauss(s, 0.17)))
    if int(row["reverse_scored"]) == 1:
        c = 1 - c
    return int(round(1 + 4 * c))


def run(eng, text, age, true_d, true_ro, policy, seed):
    rng = random.Random(seed * 7 + 1)
    sev = {d: rng.uniform(0.6, 0.92) for d in true_d}
    sev.update({r: rng.uniform(0.6, 0.9) for r in true_ro})
    s = eng.start(text, age, seed=seed, use_router=(policy == "full"))
    if policy == "oracle":
        s.prior = {d: (0.9 if d in true_d else 0.06) for d in DOMAINS}
        s.prior.update({r: (0.6 if r in true_ro else 0.0) for r in RULEOUTS})
        s.safety, s.unclear = False, False
    if policy == "full" and s.unclear:                 # Recall Help: simulate a parent who taps their true domains
        eng.apply_recall_choice(s, list(true_d) or [])
    first_hit = None
    guard = 0
    while guard < 60:
        guard += 1
        a = eng.next_action(s)
        if a["type"] in ("safety_notice",):
            continue
        if a["type"] == "recall_help":
            eng.apply_recall_choice(s, list(true_d)); continue
        if a["type"] == "done":
            break
        row = eng.bank.row(a["item_id"])
        if first_hit is None and a["track"] in (set(true_d) | set(true_ro)):
            first_hit = len(s.answers) + 1
        eng.answer(s, a["item_id"], simulate_answer(row, a["track"], sev, rng), track=a["track"])
    res = eng.result(s)
    pred = set(res["flagged_domains"])
    tp = len(pred & set(true_d)); fp = len(pred - set(true_d)); fn = len(set(true_d) - pred)
    # depth on true domains = how many items asked there
    depth = np.mean([len(s.scored(d)) for d in true_d]) if true_d else np.nan
    return dict(tp=tp, fp=fp, fn=fn, nq=len(s.answers), first_hit=first_hit, depth=depth,
                ro_found=int(bool(set(true_ro) & set(res["ruleout_flags"]))) if true_ro else None,
                n_true=len(true_d), exact=int(pred == set(true_d)),
                refer_in_true=sum(1 for d in true_d if res["domains"][d]["state"] == "Refer"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-gen", type=int, default=600)
    ap.add_argument("--reps", type=int, default=2)
    a = ap.parse_args()
    router_path = str(BACKEND_ROOT / "ml" / "artifacts" / "module_b_router" / "router_b.joblib")
    if not os.path.exists(router_path):
        router_path = str(BACKEND_ROOT / "artifacts" / "router_b.joblib")
    router = DomainRouter.load(router_path)
    eng = Engine(router)

    full_csv = MODULE_B_DIR / "parent_text_dataset_full.csv"
    if not full_csv.exists():
        full_csv = BACKEND_ROOT / "data" / "parent_text_dataset_full.csv"
    hw_csv = MODULE_B_DIR / "handwritten_eval_b.csv"
    if not hw_csv.exists():
        hw_csv = BACKEND_ROOT / "data" / "handwritten_eval_b.csv"
    full = pd.read_csv(str(full_csv))
    hw = pd.read_csv(str(hw_csv))
    gen = full[(full.split == "test") & (full.is_unclear == 0) & (full.safety == 0)].sample(a.n_gen, random_state=SEED)

    sets = {"handwritten(independent)": hw[(hw.is_unclear == 0) & (hw.safety == 0)], "generator test(unseen)": gen}
    out = {}
    for sname, df in sets.items():
        df = df[df[DOMAINS].sum(axis=1) > 0]
        print(f"\n== {sname}: {len(df)} notes x {a.reps} reps")
        for policy in ("no_text", "full", "oracle"):
            rows = []
            for rep in range(a.reps):
                for i, r in enumerate(df.itertuples()):
                    true_d = [d for d in DOMAINS if getattr(r, d) == 1]
                    true_ro = [x for x in RULEOUTS if getattr(r, x) == 1]
                    age = random.Random(SEED + i).randint(5, 12)
                    rows.append(run(eng, r.text, age, true_d, true_ro, policy, seed=rep * 1000 + i))
            m = pd.DataFrame(rows)
            tp, fp, fn = m.tp.sum(), m.fp.sum(), m.fn.sum()
            P, R = tp / max(1, tp + fp), tp / max(1, tp + fn)
            res = dict(domain_P=round(P, 3), domain_R=round(R, 3), F1=round(2 * P * R / max(1e-9, P + R), 3),
                       exact_set=round(m.exact.mean(), 3), mean_questions=round(m.nq.mean(), 1),
                       first_relevant_q=round(m.first_hit.dropna().mean(), 2), items_per_true_domain=round(m.depth.mean(), 2),
                       ruleout_found=None if m.ro_found.dropna().empty else round(m.ro_found.dropna().mean(), 2))
            out[f"{sname}|{policy}"] = res
            print(f"  {policy:8s}", res)
    json.dump(out, open(os.path.join(ROOT, "artifacts", "simulation_results.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
