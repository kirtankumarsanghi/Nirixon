"""Expand the concept tables into the full Module B question bank.

Run:  python src/build_question_bank.py
Writes data/question_bank_b.csv, data/question_bank_b.jsonl,
       data/concept_index_b.csv
"""

import csv
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from qb_content_1 import ATTENTION, LISTENING_SPEAKING, READING, WRITING
from qb_content_2 import EMOTION_SCHOOL, MOTOR, NUMBERS, SOCIAL
from qb_content_3 import CONTEXT, GLOBAL_ASD, SAFETY, VISION_HEARING
from qb_slots import BANDS, DOMAIN_LABEL, SCALE_FREQ, SCALE_IMPACT, SLOTS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

DOMAINS = {
    "attention_work": ATTENTION,
    "listening_speaking": LISTENING_SPEAKING,
    "reading": READING,
    "writing": WRITING,
    "numbers": NUMBERS,
    "motor": MOTOR,
    "social": SOCIAL,
    "emotion_school": EMOTION_SCHOOL,
}

# A symptom item that, when endorsed, should also raise attention to another
# domain or a rule-out group (used by the selector as a "cross signal").
CROSS_SIGNAL = {
    "ls_repeat": "ruleout_vision_hearing",
    "ls_called_behind": "ruleout_vision_hearing",
    "ls_not_listen": "ruleout_vision_hearing",
    "rd_fatigue": "ruleout_vision_hearing",
    "rd_finger": "ruleout_vision_hearing",
    "rd_skip": "ruleout_vision_hearing",
    "ls_cues": "ruleout_global_asd",
    "ls_literal": "ruleout_global_asd",
    "ls_topic": "ruleout_global_asd",
    "sc_cues": "ruleout_global_asd",
    "sc_space": "ruleout_global_asd",
    "sc_misread_tease": "ruleout_global_asd",
    "sc_prefers_adults": "ruleout_global_asd",
    "ls_limited_speech": "ruleout_global_asd",
    "ls_simple_instr": "ruleout_global_asd",
    "em_change": "ruleout_global_asd",
    "ls_silent_school": "emotion_school",
    "em_speak_class": "listening_speaking",
    "rd_aloud_avoid": "emotion_school",
    "nm_avoid": "emotion_school",
    "wr_grip": "motor",
    "mt_untidy": "writing",
    "sc_teased": "emotion_school",
    "sc_hit": "safety",
    "sc_school_avoid_peers": "safety",
    "em_hopeless": "safety",
    "em_self_hurt": "safety",
    "em_serious_aggr": "safety",
    "sc_hurts_others": "emotion_school",
    "em_sleep": "attention_work",
    "mt_toe": "neuromotor_referral",
    "mt_weak_side": "neuromotor_referral",
    "mt_falls": "neuromotor_referral",
}

RED_FLAG_ACTION = {
    "em_hopeless": "show_helpline",
    "em_self_hurt": "show_helpline",
    "em_serious_aggr": "urgent_review",
    "sc_hit": "bullying_support",
    "sc_school_avoid_peers": "bullying_support",
    "sc_hurts_others": "urgent_review",
    "att_danger": "safety_advice",
    "ls_simple_instr": "refer_developmental",
    "mt_toe": "refer_rbsk_deic",
    "mt_weak_side": "refer_rbsk_deic",
    "mt_falls": "refer_rbsk_deic",
    "gd_regress": "refer_pediatric_urgent",
    "gd_seizure": "refer_pediatric_urgent",
}

FIELDS = [
    "item_id",
    "domain",
    "subdomain",
    "concept_id",
    "item_type",
    "level",
    "form",
    "age_bands",
    "text",
    "response_type",
    "scale_labels",
    "reverse_scored",
    "weight",
    "red_flag",
    "red_flag_action",
    "cross_signal",
    "slot",
    "slot_value",
    "stem_variant",
    "construct_basis",
    "validation_status",
    "clinical_review",
]

CONSTRUCT_BASIS = {
    "attention_work": "attention/hyperactivity/impulsivity constructs (ADHD criteria family)",
    "listening_speaking": "ICD-11 developmental speech/language constructs",
    "reading": "reading/decoding/comprehension constructs (SLD literature)",
    "writing": "handwriting/spelling/composition constructs (SLD literature)",
    "numbers": "number sense/arithmetic/word-problem constructs (SLD literature)",
    "motor": "developmental coordination constructs",
    "social": "peer/prosocial constructs (SDQ-type domain)",
    "emotion_school": "emotional/conduct/school-adjustment constructs (SDQ-type domain)",
}


def lc(s):
    return s[0].lower() + s[1:]


def compose(form, stem):
    return ("Your child " if form == "P" else "This child ") + lc(stem) + "."


def band_codes(bands):
    return [b for b in BANDS] if bands == "A" else bands.split(",")


rows = []


def add(**kw):
    r = {k: "" for k in FIELDS}
    r.update(kw)
    r["validation_status"] = "synthetic_unvalidated"
    r["clinical_review"] = "pending"
    rows.append(r)


def expand_concepts():
    for domain, concepts in DOMAINS.items():
        for cid, sub, lvl, slot, rev, bands, formflag, rf, stems in concepts:
            forms = ["P"] + (["T"] if "T" in formflag else [])
            for form in forms:
                for si, stem in enumerate(stems):
                    var = "ab"[si]
                    if slot:
                        for band in band_codes(bands):
                            pool = (
                                SLOTS.get(slot + "_t", SLOTS[slot])
                                if form == "T"
                                else SLOTS[slot]
                            )
                            for vi, val in enumerate(pool[band]):
                                text = compose(
                                    form, stem.replace("{" + slot + "}", val)
                                )
                                add(
                                    item_id=f"{cid}.{form}.{band}.{var}{vi}",
                                    domain=domain,
                                    subdomain=sub,
                                    concept_id=cid,
                                    item_type="strength" if rev else "symptom",
                                    level=lvl,
                                    form="parent" if form == "P" else "teacher",
                                    age_bands=band,
                                    text=text,
                                    response_type="likert5",
                                    scale_labels=SCALE_FREQ,
                                    reverse_scored=rev,
                                    weight={1: 1.0, 2: 1.0, 3: 1.5}[lvl],
                                    red_flag=rf,
                                    red_flag_action=(
                                        RED_FLAG_ACTION.get(cid, "refer_review")
                                        if rf
                                        else ""
                                    ),
                                    cross_signal=CROSS_SIGNAL.get(cid, ""),
                                    slot=slot,
                                    slot_value=val,
                                    stem_variant=var,
                                    construct_basis=CONSTRUCT_BASIS[domain],
                                )
                    else:
                        text = compose(form, stem)
                        add(
                            item_id=f"{cid}.{form}.all.{var}",
                            domain=domain,
                            subdomain=sub,
                            concept_id=cid,
                            item_type="strength" if rev else "symptom",
                            level=lvl,
                            form="parent" if form == "P" else "teacher",
                            age_bands="|".join(band_codes(bands)),
                            text=text,
                            response_type="likert5",
                            scale_labels=SCALE_FREQ,
                            reverse_scored=rev,
                            weight={1: 1.0, 2: 1.0, 3: 1.5}[lvl],
                            red_flag=rf,
                            red_flag_action=(
                                RED_FLAG_ACTION.get(cid, "refer_review") if rf else ""
                            ),
                            cross_signal=CROSS_SIGNAL.get(cid, ""),
                            slot="",
                            slot_value="",
                            stem_variant=var,
                            construct_basis=CONSTRUCT_BASIS[domain],
                        )


def expand_fixed(table, item_type):
    for key, group, rtype, formflag, rf, phrasings in table:
        forms = []
        if "P" in formflag:
            forms.append("P")
        if "T" in formflag:
            forms.append("T")
        for form in forms:
            for pi, ph in enumerate(phrasings):
                var = "ab"[pi]
                is_question = ph.rstrip().endswith("?")
                if (
                    rtype == "likert5"
                    and not is_question
                    or form == "T"
                    and not is_question
                ):
                    text = compose(form, ph)
                    labels = SCALE_FREQ
                else:
                    text = ph
                    labels = ""
                if rtype.startswith("choice:"):
                    labels = rtype.split(":", 1)[1].replace("/", "|")
                    rt = "choice"
                else:
                    rt = rtype
                    if rt == "yesno":
                        labels = "Yes|No|Not sure"
                add(
                    item_id=f"{key}.{form}.all.{var}",
                    domain=("safety" if group == "safety" else group),
                    subdomain=group,
                    concept_id=key,
                    item_type=item_type,
                    level=1 if item_type != "context" else 0,
                    form="parent" if form == "P" else "teacher",
                    age_bands="|".join(BANDS),
                    text=text,
                    response_type=rt,
                    scale_labels=labels,
                    reverse_scored=0,
                    weight=1.0 if item_type not in ("context",) else 0.0,
                    red_flag=rf,
                    red_flag_action=(
                        (
                            "show_helpline"
                            if group == "safety" and key.startswith("sf_self")
                            else (
                                "bullying_support"
                                if key in ("sf_threat",)
                                else (
                                    "safeguarding_review"
                                    if group == "safety"
                                    else RED_FLAG_ACTION.get(key, "refer_review")
                                )
                            )
                        )
                        if rf
                        else ""
                    ),
                    cross_signal="",
                    stem_variant=var,
                    construct_basis=(
                        "triage / rule-out (not a functioning domain)"
                        if item_type == "ruleout"
                        else (
                            "safety screening"
                            if item_type == "safety"
                            else "context for the report"
                        )
                    ),
                )


def expand_probes():
    for domain, label in DOMAIN_LABEL.items():
        P = [
            (
                "dur",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Have these difficulties with {label} been present for more than 6 months?",
            ),
            (
                "setting",
                "choice",
                "Only at home|Only outside home|At home and outside|Not sure",
                0,
                f"Do you see these difficulties with {label} only at home, only outside home, or in both?",
            ),
            (
                "onset",
                "choice",
                "Before age 5|Age 5 to 7|After age 7|Not sure",
                0,
                f"When did you first notice difficulties with {label}?",
            ),
            (
                "imp_school",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect schoolwork and marks?",
            ),
            (
                "imp_peers",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect friendships?",
            ),
            (
                "imp_home",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect family life and daily routines?",
            ),
            (
                "imp_self",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect your child's confidence and mood?",
            ),
            (
                "tried",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Have you or the school already tried anything to help with {label}?",
            ),
            (
                "helped",
                "likert5",
                SCALE_IMPACT,
                0,
                f"If something was tried for {label}, how much did it help?",
            ),
            (
                "trend",
                "choice",
                "Getting better|About the same|Getting worse|Not sure",
                0,
                f"Compared with six months ago, are the difficulties with {label} better, the same, or worse?",
            ),
            (
                "teacher",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Has a teacher ever raised a concern about {label}?",
            ),
            (
                "family",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Has anyone close in the family had similar difficulties with {label}?",
            ),
        ]
        T = [
            (
                "dur",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Have you seen these difficulties with {label} for more than a term?",
            ),
            (
                "setting",
                "choice",
                "In all subjects|In some subjects|Only in certain tasks|Not sure",
                0,
                f"Do you see these difficulties with {label} in all subjects, some subjects, or only in certain tasks?",
            ),
            (
                "imp_school",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect this child's classwork and marks?",
            ),
            (
                "imp_peers",
                "likert5",
                SCALE_IMPACT,
                1,
                f"How much do these difficulties with {label} affect this child's relationships in class?",
            ),
            (
                "trend",
                "choice",
                "Getting better|About the same|Getting worse|Not sure",
                0,
                f"Compared with the start of the year, are the difficulties with {label} better, the same, or worse?",
            ),
            (
                "tried",
                "choice",
                "Yes|No|Not sure",
                0,
                f"Have you tried any classroom support for {label}?",
            ),
        ]
        for form, table in (("P", P), ("T", T)):
            for key, rt, labels, impact, text in table:
                add(
                    item_id=f"meta_{domain}_{key}.{form}.all.a",
                    domain=domain,
                    subdomain="probe",
                    concept_id=f"meta_{domain}_{key}",
                    item_type="probe_impact" if impact else "probe_context",
                    level=2,
                    form="parent" if form == "P" else "teacher",
                    age_bands="|".join(BANDS),
                    text=text,
                    response_type=rt,
                    scale_labels=labels,
                    reverse_scored=0,
                    weight=0.0,
                    construct_basis="impairment/context probe (asked only for flagged domains)",
                    stem_variant="a",
                )


def main():
    os.makedirs(OUT, exist_ok=True)
    expand_concepts()
    expand_fixed(VISION_HEARING, "ruleout")
    expand_fixed(GLOBAL_ASD, "ruleout")
    expand_fixed(SAFETY, "safety")
    expand_fixed(CONTEXT, "context")
    expand_probes()

    # Identical wording that applies to several age bands (e.g. "classwork" for
    # both 8-10 and 11-12) is merged into one item that lists all its bands.
    merged, seen = [], {}
    for r in rows:
        key = (r["form"], r["text"])
        if key in seen:
            keep = seen[key]
            bands = keep["age_bands"].split("|")
            for b in r["age_bands"].split("|"):
                if b not in bands:
                    bands.append(b)
            keep["age_bands"] = "|".join(sorted(bands, key=BANDS.index))
        else:
            seen[key] = r
            merged.append(r)
    rows[:] = merged

    ids = [r["item_id"] for r in rows]
    dup = [k for k, v in Counter(ids).items() if v > 1]
    assert not dup, f"duplicate ids: {dup[:5]}"
    texts = Counter((r["form"], r["text"]) for r in rows)
    dup_text = [k for k, v in texts.items() if v > 1]
    assert not dup_text, f"duplicate texts: {dup_text[:5]}"

    with open(
        os.path.join(OUT, "question_bank_b.csv"), "w", newline="", encoding="utf-8"
    ) as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(OUT, "question_bank_b.jsonl"), "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # concept index: one row per underlying construct
    idx = defaultdict(lambda: {"variants": 0})
    for r in rows:
        c = idx[r["concept_id"]]
        c.update(
            domain=r["domain"],
            subdomain=r["subdomain"],
            level=r["level"],
            item_type=r["item_type"],
        )
        c["variants"] += 1
    with open(
        os.path.join(OUT, "concept_index_b.csv"), "w", newline="", encoding="utf-8"
    ) as f:
        w = csv.writer(f)
        w.writerow(
            [
                "concept_id",
                "domain",
                "subdomain",
                "level",
                "item_type",
                "n_text_variants",
            ]
        )
        for k, v in sorted(idx.items()):
            w.writerow(
                [
                    k,
                    v["domain"],
                    v["subdomain"],
                    v["level"],
                    v["item_type"],
                    v["variants"],
                ]
            )

    print("TOTAL question texts:", len(rows))
    print("DISTINCT concepts   :", len(idx))
    print("by item_type:", dict(Counter(r["item_type"] for r in rows)))
    print("by form     :", dict(Counter(r["form"] for r in rows)))
    print("by domain   :", dict(Counter(r["domain"] for r in rows)))
    sy = [r for r in rows if r["item_type"] in ("symptom", "strength")]
    print("symptom/strength by domain x band-set:")
    for d in DOMAINS:
        for band in BANDS:
            n = sum(
                1
                for r in sy
                if r["domain"] == d
                and r["form"] == "parent"
                and band in r["age_bands"].split("|")
            )
            nc = len(
                {
                    r["concept_id"]
                    for r in sy
                    if r["domain"] == d
                    and r["form"] == "parent"
                    and band in r["age_bands"].split("|")
                }
            )
            print(f"  {d:20s} {band:6s} parent texts={n:4d} concepts={nc:3d}")


if __name__ == "__main__":
    main()
