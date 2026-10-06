"""Add concept diversity to the router training data.

Why: generate_text_dataset.py has only ~15 base symptom phrases per domain (x3 languages),
so 17k rows hide a small effective vocabulary of behaviours. This script adds:

  1. BANK-DERIVED ENGLISH notes: every symptom/rule-out item in question_bank_b.csv
     (~400 distinct behaviour concepts) rewritten as a parent/teacher note. Splits are by
     concept_id, so a test concept (and all its wordings) is never seen in training.
     This also ties the text router to the exact behaviours the questionnaire asks about.
  2. LEXICON-BASED HINGLISH / HINDI notes: "<topic> mein <difficulty>" sentences built from
     domain topic lists. Topics are split train/val/test, so unseen topics are tested.
     Includes "<topic> mein koi dikkat nahi" hard negatives. These are template-light and
     WEAKER than real parent text: they teach vocabulary, not natural phrasing.

Output: data/parent_text_dataset_full.csv  (original rows + these, with an `origin` column)
Run:    python src/augment_dataset.py
"""
import csv
import hashlib
import os
import random
import re
import sys
from collections import Counter

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import generate_text_dataset as G
from seeds_other import INTROS, TIME_MODS, NOISE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LABELS = G.LABELS

BANK_MAP = {
    "attention_work": "attention_work", "listening_speaking": "listening_speaking", "reading": "reading",
    "writing": "writing", "numbers": "numbers", "motor": "motor", "social": "social",
    "emotion_school": "emotion_school", "ruleout_vision_hearing": "vision_hearing", "ruleout_global_asd": "global_asd",
}
DOMAIN_W = {"attention_work": 1.3, "listening_speaking": 1.0, "reading": 1.0, "writing": 1.0, "numbers": 1.0,
            "motor": 0.9, "social": 1.0, "emotion_school": 1.4, "vision_hearing": 0.6, "global_asd": 0.6}


def split_of(key):
    h = int(hashlib.md5(key.encode()).hexdigest(), 16) % 100
    return "train" if h < 65 else "val" if h < 80 else "test"


def to_note(text, form, gender, rng):
    """Rewrite a questionnaire statement as a note in a parent's/teacher's voice."""
    t = text.strip()
    subj = rng.choice(["My son", "My son", "My child"]) if gender == "m" else rng.choice(["My daughter", "My daughter", "My child"])
    pron = "he" if gender == "m" else "she"
    poss = "his" if gender == "m" else "her"
    t = t.replace(" his or her ", f" {poss} ").replace(" he or she ", f" {pron} ")
    if form == "teacher":
        t = re.sub(r"^Your child's", "This student's", t)
        t = re.sub(r"^Your child\b", "This child", t)
        t = re.sub(r"^This child's", "This student's", t)
        t = re.sub(r"^This child\b", rng.choice(["This student", "The child"]), t)
        return t
    if t.startswith("Your child's"):
        t = subj + "'s" + t[len("Your child's"):]
    elif t.startswith("Your child"):
        t = subj + t[len("Your child"):]
    else:
        t = t.replace("your child", "my child")
    return t


def bank_rows(rng, n, split, bank, strengths):
    pools = {}
    for r in bank.itertuples():
        if split_of(r.concept_id) == split:
            pools.setdefault(BANK_MAP[r.domain], {}).setdefault(r.concept_id, []).append((r.text, r.form))
    spool = [s for s in strengths if split_of(s[0]) == split]
    names = sorted(pools)
    w = [DOMAIN_W[x] for x in names]
    rows, seen = [], set()
    tries = 0
    while len(rows) < n and tries < n * 8:
        tries += 1
        g = rng.choice(["m", "f"])
        k = rng.choices([1, 2, 3], weights=[0.5, 0.35, 0.15])[0]
        style = "teacher" if rng.random() < 0.15 else "parent"
        chosen = []
        while len(chosen) < k:
            d = rng.choices(names, weights=w)[0]
            if d not in chosen:
                chosen.append(d)
        sents, labels, src = [], set(), []
        for d in chosen:
            cid = rng.choice(sorted(pools[d]))
            cands = [x for x in pools[d][cid] if (x[1] == "teacher") == (style == "teacher")] or pools[d][cid]
            text, form = rng.choice(cands)
            s = to_note(text, form, g, rng)
            if sents and not s.startswith(("My ", "This ", "The ")):
                s = s
            sents.append(s); labels.add(d); src.append(cid)
        # hard negative: an area described as fine
        if spool and rng.random() < 0.25:
            sid, stext = rng.choice(spool)
            sents.insert(rng.randrange(len(sents) + 1), to_note(stext, "parent" if style == "parent" else "teacher", g, rng))
            src.append("neg:" + sid)
        rng.shuffle(sents) if len(sents) > 1 and rng.random() < 0.3 else None
        text = ""
        for j, s in enumerate(sents):
            s = s if s.endswith(".") else s + "."
            if j > 0:
                s = rng.choice(["", "Also, ", "And ", "Besides that, ", "Another thing: "]) + (s[0].lower() + s[1:] if s.startswith(("My ", "This ")) is False else s)
            text += (" " if text else "") + s
        if style == "teacher":
            text = rng.choice(["Teacher's note: ", "Class observation: ", ""]) + text
        else:
            text = rng.choice(INTROS["en"]) + text
        if rng.random() < 0.3:
            text += rng.choice(TIME_MODS["en"])
        if rng.random() < 0.3:
            text += " " + G.age_phrase(rng, "en", g, rng.randint(5, 12))
        if rng.random() < 0.2:
            text += " " + NOISE[rng.randrange(len(NOISE))][0]
        text = G.noisy(rng, text, "en")
        if text in seen:
            continue
        seen.add(text)
        rows.append(dict(text=text, lang="en", style=style, gender=g, age=rng.randint(5, 12), labels=sorted(labels), sources="bank:" + "|".join(src), origin="bank_en", split=split))
    return rows


# ------------------------------------------------------------------ lexicon (Hinglish / Hindi)
TOPICS = {
    "attention_work": (["dhyan lagane", "ek jagah baithne", "homework poora karne", "cheezein yaad rakhne", "kaam shuru karne", "apna saaman sambhalne", "line mein intezaar karne", "tiffin aur bottle yaad rakhne"],
                       ["ध्यान लगाने", "एक जगह बैठने", "होमवर्क पूरा करने", "चीज़ें याद रखने", "काम शुरू करने", "अपना सामान संभालने", "अपनी बारी का इंतज़ार करने", "टिफ़िन और बोतल याद रखने"]),
    "listening_speaking": (["baat samajhne", "instructions sunne aur maanne", "apni baat batane", "poore vakya bolne", "sahi shabd dhoondhne", "saaf bolne", "kahani sunane", "sawaal ka jawab dene"],
                           ["बात समझने", "निर्देश सुनने और मानने", "अपनी बात बताने", "पूरे वाक्य बोलने", "सही शब्द ढूँढने", "साफ़ बोलने", "कहानी सुनाने", "सवाल का जवाब देने"]),
    "reading": (["padhne", "akshar pehchanne", "shabd jodkar padhne", "kitaab padhne", "paragraph samajhne", "hindi padhne", "english padhne", "zor se padhne"],
                ["पढ़ने", "अक्षर पहचानने", "शब्द जोड़कर पढ़ने", "किताब पढ़ने", "पैराग्राफ समझने", "हिंदी पढ़ने", "अंग्रेज़ी पढ़ने", "ज़ोर से पढ़ने"]),
    "writing": (["likhne", "handwriting", "spelling", "copy mein likhne", "nibandh likhne", "board se utarne", "sulekh", "vakya banane"],
                ["लिखने", "लिखावट", "वर्तनी", "कॉपी में लिखने", "निबंध लिखने", "बोर्ड से उतारने", "सुलेख", "वाक्य बनाने"]),
    "numbers": (["ganit", "jod ghatav", "pahade", "ginti", "samay dekhne", "paise ginne", "sawal hal karne", "guna bhaag"],
                ["गणित", "जोड़-घटाव", "पहाड़े", "गिनती", "समय देखने", "पैसे गिनने", "सवाल हल करने", "गुणा-भाग"]),
    "motor": (["khel-kood", "daudne-bhaagne", "gend pakadne", "cycle chalane", "kainchi chalane", "button lagane", "pencil pakadne", "santulan banane"],
              ["खेलकूद", "दौड़ने-भागने", "गेंद पकड़ने", "साइकिल चलाने", "कैंची चलाने", "बटन लगाने", "पेंसिल पकड़ने", "संतुलन बनाने"]),
    "social": (["dost banane", "dusre bachchon ke saath khelne", "apni baari ka intezaar karne", "group mein shamil hone", "dusron ki baat samajhne", "jhagde sulajhane", "sharing karne", "naye bachchon se baat karne"],
               ["दोस्त बनाने", "दूसरे बच्चों के साथ खेलने", "अपनी बारी का इंतज़ार करने", "ग्रुप में शामिल होने", "दूसरों की बात समझने", "झगड़े सुलझाने", "शेयर करने", "नए बच्चों से बात करने"]),
    "emotion_school": (["gussa sambhalne", "school jaane", "ghabrahat sambhalne", "apni feelings batane", "zidd chhodne", "haar maanne", "mood sambhalne", "akele sone"],
                       ["गुस्सा संभालने", "स्कूल जाने", "घबराहट संभालने", "अपनी भावनाएँ बताने", "ज़िद छोड़ने", "हार मानने", "मूड संभालने", "अकेले सोने"]),
    "vision_hearing": (["board dekhne", "door ka dekhne", "dhyaan se sunne", "aawaz sunne", "chhote akshar dekhne", "peeche se bulane par sunne"],
                       ["बोर्ड देखने", "दूर का देखने", "ध्यान से सुनने", "आवाज़ सुनने", "छोटे अक्षर देखने", "पीछे से बुलाने पर सुनने"]),
}
FRAMES_HR = ["mein dikkat hoti hai", "mein kaafi kamzor hai", "mein dusre bachchon se peeche hai", "mein baar baar galti [karta|karti] hai",
             "mein bahut mushkil hoti hai", "mein bilkul interest nahi [leta|leti]", "mein bahut der lagata hai", "mein madad ki zaroorat padti hai"]
FRAMES_HI = ["में दिक्कत होती है", "में काफ़ी कमज़ोर है", "में दूसरे बच्चों से पीछे है", "में बार-बार गलती [करता|करती] है",
             "में बहुत मुश्किल होती है", "में बिल्कुल रुचि नहीं [लेता|लेती]", "में बहुत देर लगाता है", "में मदद की ज़रूरत पड़ती है"]
FRAMES_NEG_HR = ["mein koi dikkat nahi hai", "mein bahut achha hai", "mein bilkul theek hai", "mein dusron se aage hai"]
FRAMES_NEG_HI = ["में कोई दिक्कत नहीं है", "में बहुत अच्छा है", "में बिल्कुल ठीक है", "में दूसरों से आगे है"]


def lex_split_idx(rng, n):
    idx = list(range(n)); rng.shuffle(idx)
    nt, nv = max(1, round(n * 0.2)), max(1, round(n * 0.15))
    return {"test": idx[:nt], "val": idx[nt:nt + nv], "train": idx[nt + nv:]}


def lexicon_rows(rng, n, split, assign):
    rows, seen, tries = [], set(), 0
    doms = sorted(TOPICS)
    w = [DOMAIN_W.get(d, 1.0) for d in doms]
    while len(rows) < n and tries < n * 8:
        tries += 1
        lang = rng.choice(["hr", "hr", "hi"])
        g = rng.choice(["m", "f"])
        k = rng.choices([1, 2, 3], weights=[0.5, 0.35, 0.15])[0]
        chosen = []
        while len(chosen) < k:
            d = rng.choices(doms, weights=w)[0]
            if d not in chosen:
                chosen.append(d)
        parts, labels = [], set()
        subj = rng.choice(G.SUBJ[lang][g])
        for j, d in enumerate(chosen):
            ti = rng.choice(assign[d][split])
            topic = TOPICS[d][0 if lang == "hr" else 1][ti]
            frame = rng.choice(FRAMES_HR if lang == "hr" else FRAMES_HI)
            parts.append(G.resolve(f"{topic} {frame}", lang, g)); labels.add(d)
        negs = []
        if rng.random() < 0.35:
            cand = [d for d in doms if d not in labels]
            d = rng.choice(cand)
            ti = rng.choice(assign[d][split])
            frame = rng.choice(FRAMES_NEG_HR if lang == "hr" else FRAMES_NEG_HI)
            negs.append(f"{TOPICS[d][0 if lang == 'hr' else 1][ti]} {frame}")
        sents = [subj + " " + parts[0]] + [("Wo " if lang == "hr" else "वो ") + p for p in parts[1:]] + [("Waise wo " if lang == "hr" else "वैसे वो ") + x for x in negs]
        if len(sents) > 1 and rng.random() < 0.3:
            rng.shuffle(sents)
        end = "।" if lang == "hi" else "."
        conn = ["Aur ", "Saath hi ", "Iske alawa "] if lang == "hr" else ["और ", "साथ ही ", "इसके अलावा "]
        text = ""
        for j, s in enumerate(sents):
            text += (" " if text else "") + (rng.choice(conn) if j else "") + s + end
        text = rng.choice(INTROS[lang]) + text
        if rng.random() < 0.35:
            text += rng.choice(TIME_MODS[lang])
        if rng.random() < 0.3:
            text += " " + G.age_phrase(rng, lang, g, rng.randint(5, 12))
        text = G.noisy(rng, text, lang)
        if text in seen:
            continue
        seen.add(text)
        rows.append(dict(text=text, lang=lang, style="parent", gender=g, age=rng.randint(5, 12), labels=sorted(labels), sources="lex", origin="lex_hr_hi", split=split))
    return rows


def main():
    bank = pd.read_csv(os.path.join(DATA, "question_bank_b.csv"))
    sym = bank[(bank.item_type.isin(["symptom", "ruleout"])) & (bank.response_type == "likert5") & (~bank.text.str.endswith("?")) & (bank.domain.isin(BANK_MAP))]
    strengths = [(r.concept_id, r.text) for r in bank[(bank.item_type == "strength") & (bank.form == "parent")].itertuples()]
    print("bank symptom/ruleout items:", len(sym), "concepts:", sym.concept_id.nunique(), "strength items:", len(strengths))

    base = pd.read_csv(os.path.join(DATA, "parent_text_dataset.csv"))
    base["origin"] = "seed_gen"

    assign_rng = random.Random(99)
    assign = {d: lex_split_idx(assign_rng, len(TOPICS[d][0])) for d in TOPICS}

    extra = []
    sizes = {"train": (7000, 3500), "val": (1400, 700), "test": (1800, 900)}   # (bank_en, lexicon)
    for split, (nb, nl) in sizes.items():
        rng = random.Random({"train": 11, "val": 12, "test": 13}[split])
        extra += bank_rows(rng, nb, split, sym, strengths)
        extra += lexicon_rows(rng, nl, split, assign)

    df = pd.DataFrame(extra)
    for lab in LABELS:
        df[lab] = df["labels"].apply(lambda L: int(lab in L))
    df["is_unclear"] = df["labels"].apply(lambda L: int(len(L) == 0))
    df["labels"] = df["labels"].apply(lambda L: "|".join(L))
    df["id"] = [f"A{i:06d}" for i in range(len(df))]
    cols = list(base.columns)
    full = pd.concat([base[cols], df[cols]], ignore_index=True)
    full.to_csv(os.path.join(DATA, "parent_text_dataset_full.csv"), index=False)
    print("full rows:", len(full))
    print(full.groupby(["origin", "split"]).size().unstack())
    print(full.groupby("lang").size().to_dict())


if __name__ == "__main__":
    main()
