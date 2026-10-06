"""Generate the labelled parent-text dataset for the Module B router.

Run:  python src/generate_text_dataset.py [--n-train 12000 --seed 7]

Design points (so the evaluation is honest):
  * Texts are assembled from clause paraphrase-groups in seeds_core.py /
    seeds_other.py. Each group is assigned to train, val OR test, so a test
    clause is never seen in training, in any language.
  * Multi-label (1-4 labels), English / Hinglish / Hindi / mixed, parent and
    teacher voice, intros, time modifiers, noise sentences, typos.
  * Hard negatives: "X is fine" clauses where the domain label is ABSENT.
  * Vague texts with no label (the router must say "unclear" for them).
"""
import argparse
import csv
import os
import random
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from seeds_core import SEEDS
from seeds_other import (OTHER, NEGATIVES, VAGUE, NOISE, INTROS, TIME_MODS, CONNECT)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

LABELS = [
    "attention_work", "listening_speaking", "reading", "writing", "numbers", "motor",
    "social", "emotion_school", "vision_hearing", "global_asd", "safety",
    "ctx_bullying", "ctx_school_refusal", "ctx_screen", "ctx_language", "ctx_pressure", "ctx_sleep",
]

# group name -> (attached labels, entries)
GROUPS = {d: ([d], e) for d, e in SEEDS.items()}
GROUPS.update(OTHER)

GROUP_WEIGHT = {
    "attention_work": 1.4, "listening_speaking": 1.0, "reading": 1.1, "writing": 1.0,
    "numbers": 1.0, "motor": 0.9, "social": 1.0, "emotion_school": 1.5,
    "vision_hearing": 0.5, "global_asd": 0.55, "safety": 0.3,
    "ctx_bullying": 0.35, "ctx_school_refusal": 0.4, "ctx_screen": 0.35,
    "ctx_language": 0.35, "ctx_pressure": 0.35, "ctx_sleep": 0.3,
}

# Hinglish / Hindi clauses whose grammatical subject is NOT the child (e.g.
# "dusre bachche use ... nahi karte") use the frame "Dikkat ye hai ki <clause>"
# instead of "Mera beta <clause>". Keys: (group, index). English needs it only
# for clauses that start with "I ".
OWN_IDX = {
    ("attention_work", 4), ("attention_work", 10), ("attention_work", 12), ("attention_work", 13),
    ("listening_speaking", 4), ("reading", 13), ("writing", 0), ("writing", 13),
    ("numbers", 4), ("numbers", 9), ("motor", 11),
    ("social", 0), ("social", 1), ("social", 6), ("social", 12), ("social", 13),
    ("vision_hearing", 9), ("safety", 2), ("safety", 5),
    ("ctx_bullying", 0), ("ctx_bullying", 1), ("ctx_bullying", 3), ("ctx_bullying", 4), ("ctx_bullying", 5),
    ("ctx_screen", 3), ("ctx_language", 0), ("ctx_language", 4),
    ("ctx_pressure", 3), ("ctx_pressure", 5), ("ctx_sleep", 1), ("ctx_sleep", 3),
    ("neg:writing", 0), ("neg:writing", 2), ("neg:reading", 2), ("neg:numbers", 2), ("neg:motor", 2),
    ("neg:social", 0), ("neg:social", 2), ("neg:vision_hearing", 0), ("neg:vision_hearing", 1),
}

SUBJ = {
    "en": {"m": ["My son", "My son", "My child", "Our son", "My boy"], "f": ["My daughter", "My daughter", "My child", "Our daughter", "My girl"]},
    "hr": {"m": ["Mera beta", "Mera beta", "Mera bachcha", "Hamara beta"], "f": ["Meri beti", "Meri beti", "Meri bachchi", "Hamari beti"]},
    "hi": {"m": ["मेरा बेटा", "मेरा बेटा", "मेरा बच्चा", "हमारा बेटा"], "f": ["मेरी बेटी", "मेरी बेटी", "मेरी बच्ची", "हमारी बेटी"]},
}
TEACHER_SUBJ = {
    "en": {"m": ["This student", "The child", "This boy"], "f": ["This student", "The child", "This girl"]},
    "hr": {"m": ["Ye bachcha", "Ye student"], "f": ["Ye bachchi", "Ye student"]},
    "hi": {"m": ["ये बच्चा", "ये छात्र"], "f": ["ये बच्ची", "ये छात्रा"]},
}
TEACHER_INTRO = {
    "en": ["Teacher's note: ", "Class observation: ", "In class, ", "As class teacher I have seen that "],
    "hr": ["Teacher ka note: ", "Class mein dekha: ", "Class teacher ke roop mein maine dekha ki "],
    "hi": ["टीचर का नोट: ", "क्लास में देखा: ", "क्लास टीचर के रूप में मैंने देखा कि "],
}
FRAME_PROBLEM = {"en": "The problem is that ", "hr": "Dikkat ye hai ki ", "hi": "दिक्कत ये है कि "}
# Negative ("this area is fine") clauses must never be framed as a problem.
FRAME_NEG = {"en": "", "hr": "Waise ", "hi": "वैसे "}
CLOSERS_VAGUE = {
    "en": ["But I really don't know what the problem is.", "I just want to understand what is wrong.", "Please tell me what to do."],
    "hr": ["Par samajh nahi aa raha asli problem kya hai.", "Bas ye jaanna hai ki dikkat kahan hai.", "Kya karna chahiye bataiye."],
    "hi": ["पर समझ नहीं आ रहा असली समस्या क्या है।", "बस ये जानना है कि दिक्कत कहाँ है।", "क्या करना चाहिए बताइए।"],
}


def resolve(text, lang, g):
    """Resolve gender tokens."""
    if lang == "en":
        if g == "m":
            text = text.replace("{He}", "He").replace("{he}", "he").replace("{his}", "his").replace("{him}", "him").replace("{himself}", "himself")
        else:
            text = text.replace("{He}", "She").replace("{he}", "she").replace("{his}", "her").replace("{him}", "her").replace("{himself}", "herself")
        return text
    idx = 0 if g == "m" else 1
    return re.sub(r"\[([^\]|]+)\|([^\]]+)\]", lambda m: m.group(idx + 1), text)


def split_entries(rng, n):
    idx = list(range(n))
    rng.shuffle(idx)
    n_test = max(1, round(n * 0.2))
    n_val = max(1, round(n * 0.15))
    return {"test": set(idx[:n_test]), "val": set(idx[n_test:n_test + n_val]), "train": set(idx[n_test + n_val:])}


def pick_entries(entries, assign, split):
    return [i for i in range(len(entries)) if i in assign[split]]


def typo(rng, s):
    words = s.split(" ")
    for _ in range(rng.choice([1, 1, 2])):
        j = rng.randrange(len(words))
        w = words[j]
        if len(w) > 4 and w.isascii() and w.isalpha():
            k = rng.randrange(1, len(w) - 2)
            op = rng.choice(["swap", "drop", "dup"])
            if op == "swap":
                w = w[:k] + w[k + 1] + w[k] + w[k + 2:]
            elif op == "drop":
                w = w[:k] + w[k + 1:]
            else:
                w = w[:k] + w[k] + w[k:]
            words[j] = w
    return " ".join(words)


def noisy(rng, s, lang):
    if rng.random() < 0.22 and lang != "hi":
        s = s.lower()
    if rng.random() < 0.15:
        s = re.sub(r"[.,;:।]", "", s)
    if rng.random() < 0.10 and lang != "hi":
        s = typo(rng, s)
    if rng.random() < 0.06:
        s = s + (" pls" if lang != "hi" else " कृपया")
    return re.sub(r"\s+", " ", s).strip()


def age_phrase(rng, lang, g, age):
    cls = max(1, age - 5)
    he = "he" if g == "m" else "she"
    opts = {
        "en": [f"{he.capitalize()} is {age} years old.", f"{he.capitalize()} is in class {cls}.", f"He is {age}." if g == "m" else f"She is {age}."],
        "hr": [f"{age} saal ka hai." if g == "m" else f"{age} saal ki hai.", f"Class {cls} mein padhta hai." if g == "m" else f"Class {cls} mein padhti hai."],
        "hi": [f"{age} साल का है।" if g == "m" else f"{age} साल की है।", f"क्लास {cls} में पढ़ता है।" if g == "m" else f"क्लास {cls} में पढ़ती है।"],
    }
    return rng.choice(opts[lang])


def clause_sentence(rng, lang, g, style, clause, first, own, neg=False):
    clause = resolve(clause, lang, g)
    subj_pool = (TEACHER_SUBJ if style == "teacher" else SUBJ)[lang][g]
    if lang == "en":
        if clause.startswith("I "):
            return clause
        he = "he" if g == "m" else "she"
        return f"{rng.choice(subj_pool)} {clause}" if first else f"{he.capitalize()} {clause}"
    if own:
        return (FRAME_NEG if neg else FRAME_PROBLEM)[lang] + clause
    if first:
        return f"{rng.choice(subj_pool)} {clause}"
    return ("Wo " if lang == "hr" else "वो ") + clause


def sentence_end(lang):
    return "।" if lang == "hi" else "."


def compose_row(rng, split, pools, neg_pools, vague_pool, noise_pool, kind):
    g = rng.choice(["m", "f"])
    age = rng.randint(5, 12)
    style = "teacher" if rng.random() < 0.14 else "parent"
    r = rng.random()
    lang = "en" if r < 0.40 else "hr" if r < 0.76 else "hi" if r < 0.90 else "mixed"
    langs_cycle = ["en", "hr"]

    labels, sources, clauses = set(), [], []  # clauses: (lang, text)

    def lang_for_clause():
        if lang == "mixed":
            return rng.choice(["en", "hr"])
        return lang

    if kind == "vague":
        i = rng.choice(vague_pool)
        L = lang_for_clause()
        clauses.append((L, VAGUE[i][{"en": 0, "hr": 1, "hi": 2}[L]], "vague", False))
        sources.append(f"vague:{i}")
    elif kind == "neg_only":
        ds = rng.sample(sorted(neg_pools), k=rng.choice([1, 2]))
        for d in ds:
            i = rng.choice(neg_pools[d])
            L = lang_for_clause()
            clauses.append((L, NEGATIVES[d][i][{"en": 0, "hr": 1, "hi": 2}[L]], "neg", (f"neg:{d}", i) in OWN_IDX))
            sources.append(f"neg:{d}:{i}")
    else:
        names = sorted(pools)
        weights = [GROUP_WEIGHT[n] for n in names]
        k = rng.choices([1, 2, 3, 4], weights=[0.45, 0.32, 0.17, 0.06])[0]
        chosen = []
        while len(chosen) < k:
            n = rng.choices(names, weights=weights)[0]
            if n not in chosen:
                chosen.append(n)
        for n in chosen:
            attached, entries = GROUPS[n]
            i = rng.choice(pools[n])
            L = lang_for_clause()
            clauses.append((L, entries[i][{"en": 0, "hr": 1, "hi": 2}[L]], n, (n, i) in OWN_IDX))
            labels.update(attached)
            sources.append(f"{n}:{i}")
        # hard negative: a different domain stated as fine
        if rng.random() < 0.28:
            cand = [d for d in neg_pools if d not in labels]
            if cand:
                d = rng.choice(cand)
                i = rng.choice(neg_pools[d])
                L = lang_for_clause()
                clauses.insert(rng.randrange(len(clauses) + 1), (L, NEGATIVES[d][i][{"en": 0, "hr": 1, "hi": 2}[L]], "neg", (f"neg:{d}", i) in OWN_IDX))
                sources.append(f"neg:{d}:{i}")

    # assemble
    base_lang = clauses[0][0]
    parts = []
    for j, (L, c, tag, own) in enumerate(clauses):
        if tag == "vague":
            s = c if (c.endswith(".") or c.endswith("।")) else c + sentence_end(L)
            if style == "parent" and L == "en" and not s.startswith(("I ", "My ")):
                s = s[0].upper() + s[1:]
            parts.append((L, s, True))
            continue
        s = clause_sentence(rng, L, g, style, c, first=(j == 0), own=own, neg=(tag == "neg"))
        s = s[0].upper() + s[1:] if L != "hi" else s
        parts.append((L, s, False))

    text = ""
    for j, (L, s, whole) in enumerate(parts):
        end = "" if (s.endswith(".") or s.endswith("।")) else sentence_end(L)
        if j == 0:
            text = s + end
        else:
            if lang == "mixed" or whole:
                text += " " + s + end
            else:
                conn = rng.choice(CONNECT[L])
                if conn.strip().startswith(",") and not whole:
                    # join: ", and he ..." -> lower-case start
                    text = text.rstrip(".।") + conn + s[0].lower() + s[1:] + end
                else:
                    text += conn.lstrip(". ,") if False else ""
                    text += " " + (conn.strip().rstrip(",") + ", " if conn.strip() and not conn.strip().startswith(",") else "") + s + end
    text = re.sub(r"([.।])(\s*[.।])+", r"\1", text)
    # extras
    L0 = base_lang
    if style == "teacher":
        intro = rng.choice(TEACHER_INTRO[L0])
        text = intro + (text[0].lower() + text[1:] if intro.endswith(("that ", "ki ", "कि ", ", ")) else text)
    else:
        text = rng.choice(INTROS[L0]) + text
    if rng.random() < 0.35 and kind != "vague":
        text += rng.choice(TIME_MODS[L0])
    if rng.random() < 0.38:
        text += " " + age_phrase(rng, L0, g, age)
    if rng.random() < 0.28:
        n = rng.choice(noise_pool)
        text += " " + NOISE[n][{"en": 0, "hr": 1, "hi": 2}[L0]]
    if kind in ("vague", "neg_only"):
        text += " " + rng.choice(CLOSERS_VAGUE[L0])
    text = noisy(rng, text, L0)
    return dict(text=text, lang=lang, style=style, gender=g, age=age, labels=sorted(labels), sources="|".join(sources))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-train", type=int, default=12000)
    ap.add_argument("--n-val", type=int, default=2400)
    ap.add_argument("--n-test", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    split_rng = random.Random(1234)  # fixed so splits do not change with --seed
    assign = {n: split_entries(split_rng, len(GROUPS[n][1])) for n in sorted(GROUPS)}
    neg_assign = {}
    for d, ents in NEGATIVES.items():
        n = len(ents)
        neg_assign[d] = {"train": list(range(max(1, n - 1))), "val": [n - 1], "test": [n - 1]}
    v = list(range(len(VAGUE)))
    split_rng.shuffle(v)
    vague_assign = {"test": v[:3], "val": v[3:6], "train": v[6:]}
    noise_pool = list(range(len(NOISE)))

    rows = []
    sizes = {"train": args.n_train, "val": args.n_val, "test": args.n_test}
    for split, n_rows in sizes.items():
        rng = random.Random(args.seed * 100 + {"train": 1, "val": 2, "test": 3}[split])
        pools = {n: pick_entries(GROUPS[n][1], assign[n], split) for n in GROUPS}
        pools = {n: p for n, p in pools.items() if p}
        neg_pools = {d: neg_assign[d][split] for d in NEGATIVES}
        seen, tries = set(), 0
        made = 0
        while made < n_rows and tries < n_rows * 6:
            tries += 1
            roll = rng.random()
            kind = "vague" if roll < 0.06 else "neg_only" if roll < 0.09 else "normal"
            row = compose_row(rng, split, pools, neg_pools, vague_assign[split], noise_pool, kind)
            if row["text"] in seen:
                continue
            seen.add(row["text"])
            row["split"] = split
            rows.append(row)
            made += 1

    # drop val/test texts that exactly equal a train text (belt and braces)
    train_texts = {r["text"] for r in rows if r["split"] == "train"}
    rows = [r for r in rows if r["split"] == "train" or r["text"] not in train_texts]

    cols = ["id", "split", "text", "lang", "style", "gender", "age", "labels"] + LABELS + ["is_unclear", "sources"]
    with open(os.path.join(OUT, "parent_text_dataset.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for i, r in enumerate(rows):
            out = {"id": f"T{i:06d}", "split": r["split"], "text": r["text"], "lang": r["lang"], "style": r["style"],
                   "gender": r["gender"], "age": r["age"], "labels": "|".join(r["labels"]), "sources": r["sources"]}
            for lab in LABELS:
                out[lab] = 1 if lab in r["labels"] else 0
            out["is_unclear"] = 1 if not r["labels"] else 0
            w.writerow(out)

    print("rows:", len(rows), dict(Counter(r["split"] for r in rows)))
    print("lang:", dict(Counter(r["lang"] for r in rows)))
    print("labels per row:", dict(sorted(Counter(len(r["labels"]) for r in rows).items())))
    cnt = Counter(l for r in rows for l in r["labels"])
    print("label counts:", {l: cnt[l] for l in LABELS})


if __name__ == "__main__":
    main()
