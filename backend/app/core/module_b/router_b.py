"""NLP router for Module B (ages 5-12).

Job: turn a parent's / teacher's free-text note into
  * a prior weight per functioning domain  (decides which questions come first)
  * rule-out flags (vision/hearing, global/ASD-like)  -> always get screened
  * context flags (bullying, screen time, language medium, ...)
  * a SAFETY flag (self-harm / abuse language)         -> bypasses the questionnaire
  * an "unclear" flag                                  -> show the Recall Help chips

It is a ROUTER, not a classifier of conditions: it never says what the child has.
(Blueprint 5.6.)

Two layers:
  1. TF-IDF (char n-grams + words) + one-vs-rest logistic regression. Char n-grams
     make it robust to Hinglish spelling variation, typos and Devanagari.
  2. Explainable rule layer: keyword/regex patterns with a clause-level
     "this area is fine" negation guard. Used for (a) the safety check, where recall
     matters more than precision, (b) evidence phrases shown to the user, and
     (c) a small boost when the classifier is borderline.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib  # type: ignore[import-untyped]

DOMAINS = [
    "attention_work",
    "listening_speaking",
    "reading",
    "writing",
    "numbers",
    "motor",
    "social",
    "emotion_school",
]
RULEOUTS = ["vision_hearing", "global_asd"]
CONTEXT = [
    "ctx_bullying",
    "ctx_school_refusal",
    "ctx_screen",
    "ctx_language",
    "ctx_pressure",
    "ctx_sleep",
]
LABELS = DOMAINS + RULEOUTS + ["safety"] + CONTEXT

# --------------------------------------------------------------------------- rules
# Lower-cased regex fragments. Latin (English/Hinglish) and Devanagari together.
RULES = {
    "attention_work": [
        r"(can'?t|cannot|won'?t|doesn'?t|does not|unable to) (sit|stay seated|focus|concentrate|stay still|settle)",
        r"sit (still|through|for)",
        r"restless",
        r"fidget",
        r"distract",
        r"daydream",
        r"careless",
        r"forget(s|ful)? (everything|books?|his|her|the|to)",
        r"loses? (his |her )?(pencil|things|books?)",
        r"(never|doesn'?t|does not) (finish|complete)",
        r"half.?finish",
        r"unfinished",
        r"calls? out",
        r"interrupt",
        r"bait?h(ta|ti|na)? nahi",
        r"bhool (jata|jati|jaata|jaati)",
        r"dhyan nahi",
        r"uth (jata|jati|jaata)",
        r"jaldb?azi",
        r"टिक(कर)? नहीं बैठ",
        r"भूल",
        r"ध्यान",
        r"अधूरा",
        r"बेचैन",
    ],
    "listening_speaking": [
        r"follow(s)? (instructions?|what is said|two|three|multi)",
        r"instructions?",
        r"needs? (everything )?repeat",
        r"(doesn'?t|does not) (listen|understand what)",
        r"broken sentences",
        r"short (broken )?sentences",
        r"explain (what|his|her|the)",
        r"stutter",
        r"stammer",
        r"unclear speech",
        r"pronounc",
        r"right word",
        r"word.?finding",
        r"sahi shabd",
        r"explain nahi",
        r"bol nahi",
        r"baat nahi (keh|samajh)",
        r"अटक(ती|ता)? ",
        r"वाक्य",
        r"शब्द ढूँढ",
        r"बात नहीं कह",
    ],
    "reading": [
        r"read(s|ing)? (aloud|slow|like|very slow)",
        r"guess(es)? (the )?words?",
        r"loses? (his |her )?place",
        r"skips? (lines?|words?)",
        r"\bb and d\b",
        r"\bb/d\b",
        r"letter reversal",
        r"reversals?",
        r"reads? .{0,15}younger",
        r"sounds? out",
        r"padh(ne|ta|ti) (mein|me)",
        r"atak atak",
        r"line chhod",
        r"shabd.*(pehchan|padh)",
        r"अक्षर",
        r"पढ़(ने|ता|ती)",
        r"अटककर पढ़",
    ],
    "writing": [
        r"handwriting",
        r"spell(ing|s)?\b",
        r"messy",
        r"untidy",
        r"written (answers?|work)",
        r"copy(ing)? (from|the board)",
        r"board work",
        r"lik(hta|hti|hne) (mein|me|hai)",
        r"likhawat",
        r"lipi",
        r"लिखावट",
        r"वर्तनी",
        r"लिखने",
    ],
    "numbers": [
        r"\bmath(s|ematics)?\b",
        r"arithmetic",
        r"times? tables?",
        r"\btables?\b.*(remember|memor|stay)",
        r"counts? on (her |his )?fingers",
        r"subtract",
        r"addition",
        r"borrow",
        r"fraction",
        r"tell(ing)? (the )?time",
        r"clock",
        r"word problems?",
        r"ganit",
        r"pahade",
        r"jod.?ghat",
        r"ghadi",
        r"गणित",
        r"पहाड़े",
        r"जोड़",
    ],
    "motor": [
        r"trips?\b",
        r"clums",
        r"drops? things",
        r"catch (a |the )?ball",
        r"\bball\b",
        r"shoe.?laces?",
        r"button",
        r"\bzip",
        r"scissors",
        r"pencil grip",
        r"balance",
        r"bicycle|\bcycle\b",
        r"\bpt\b",
        r"coordination",
        r"gir (jata|jati|jaata|jaati)",
        r"\bgend\b",
        r"kainchi",
        r"दौड़",
        r"गेंद",
        r"गिर",
    ],
    "social": [
        r"(no|any|doesn'?t have any|no real) friends?",
        r"sits? alone",
        r"plays? alone",
        r"left out",
        r"(doesn'?t|don'?t|do not) include",
        r"\bdost\b",
        r"\bakela\b",
        r"khel(ne)? (mein|me|nahi)",
        r"(bachche|bachchon).*(nahi|se)",
        r"take turns",
        r"fights? (with|over)",
        r"दोस्त",
        r"अकेला",
        r"खेल में शामिल",
    ],
    "emotion_school": [
        r"\bcr(y|ies|ying)\b",
        r"angry|anger",
        r"tantrum",
        r"worr(y|ied|ies)",
        r"anxious|anxiety",
        r"scared|afraid|fear",
        r"\bsad\b|unhappy",
        r"stomach ?(ache|pain|hurts)",
        r"throws? (her |his |the )?(bag|things)",
        r"shout",
        r"stress",
        r"ghabra",
        r"gussa",
        r"ro (padta|padti|deta|deti)",
        r"\bdar(ta|ti)\b",
        r"chinta",
        r"tantrum",
        r"रो ",
        r"गुस्सा",
        r"डर",
        r"घबरा",
    ],
    "vision_hearing": [
        r"squint",
        r"blurr?y",
        r"(can'?t|cannot) see",
        r"(sits?|sitting) (very )?close to (the )?(tv|board)",
        r"rubs? (his |her )?eyes",
        r"eye ?sight|\beyes?\b.*(check|test|problem)",
        r"hear(ing)?\b",
        r"volume|loud tv|tv .{0,15}loud",
        r"watch(es)? (my )?lips?",
        r"dikhta nahi",
        r"aankh(ein)?",
        r"sunta nahi|sunai",
        r"\bkaan\b",
        r"awaaz.*tez",
        r"दिखता",
        r"आँख",
        r"कान",
        r"सुनाई",
    ],
    "global_asd": [
        r"eye contact",
        r"looks? away",
        r"lines? up",
        r"exact order",
        r"meltdown",
        r"only (talks?|speaks?) about",
        r"own world",
        r"repetit",
        r"echo",
        r"\bspins?\b",
        r"flap",
        r"routine (changes|is changed)",
        r"obsess",
        r"aankh nahi milata",
        r"apni (hi )?duniya",
        r"routine badl",
        r"आँख नहीं मिल",
        r"अपनी ही दुनिया",
    ],
    "ctx_bullying": [
        r"bull(y|ied|ies|ying)",
        r"teas(e|ed|ing)",
        r"mazaak",
        r"cheen",
        r"(hit|beat|push)(s|es)? (him|her) (at|in) school",
        r"चिढ़ा|मज़ाक",
    ],
    "ctx_school_refusal": [
        r"refus(e|es|ed|ing) (to )?(go|board|attend)",
        r"(doesn'?t|does not|won'?t) want to (go|board)",
        r"school (jane|jaane) (se|ke naam)",
        r"scared to go to school",
        r"skip(s|ping)? school",
        r"missed .{0,20}school",
        r"school (se )?dar",
        r"स्कूल जाने से",
        r"स्कूल नहीं",
    ],
    "ctx_screen": [
        r"\bphone\b",
        r"\bmobile\b",
        r"screen",
        r"\bgam(e|es|ing)\b",
        r"youtube|reels",
        r"\btv\b.*(hours|all day)",
        r"फोन|मोबाइल",
    ],
    "ctx_language": [
        r"\bmedium\b",
        r"bilingual",
        r"mixes? (two )?languages",
        r"english nahi",
        r"language at home",
        r"मीडियम",
    ],
    "ctx_pressure": [
        r"\bexams?\b",
        r"\bmarks\b",
        r"\bfail\b",
        r"\brank\b",
        r"compar(e|ed|ison)",
        r"tuition",
        r"percentage",
        r"नंबर|परीक्षा",
    ],
    "ctx_sleep": [
        r"\bsleep",
        r"asleep",
        r"awake",
        r"midnight",
        r"insomnia",
        r"neend",
        r"jaag",
        r"सोत|नींद",
    ],
}

# High-recall safety patterns. A false alarm costs one helpline screen; a miss costs far more.
SAFETY_RULES = [
    r"kill(s|ing)? (him|her|them)?self",
    r"suicid",
    r"want(s|ed)? to (die|be dead)",
    r"wish(es)? (he|she) (was|were) dead",
    r"end(ing)? (his|her) (own )?life",
    r"hurt(s|ing)? (him|her)self",
    r"harm(s|ing)? (him|her)self",
    r"self.?harm",
    r"cut(s|ting)? (him|her)self",
    r"(on purpose).{0,30}(hurt|cut|injur)|(hurt|cut|injur).{0,30}on purpose",
    r"does(n'?t| not) want to (live|be alive)",
    r"better off (dead|without)",
    r"no reason to live",
    r"khud ko (khatam|hurt|chot|maar|nuksan)",
    r"jeena nahi (chahta|chahti)",
    r"jeene ka mann nahi",
    r"mar(na)? jaun|marna (chahta|chahti)|mar jana chahta|mar jaana chahta",
    r"apni jaan",
    r"suicide|aatmhatya",
    r"मर( जाना|ना)? ?चाह",
    r"जीना नहीं",
    r"जीने का मन नहीं",
    r"खुद को (खत्म|चोट|नुकसान)",
    r"आत्महत्या",
    r"abus(e|ed|ing)",
    r"molest",
    r"sexual",
    r"touch(ed|es|ing)? (her|him|them) (wrongly|inappropriately|in a bad way)",
    r"galat (tarike|tareeke) se (chhu|chua|touch)",
    r"gande tarike",
    r"गलत तरीके से छू",
    r"hits? (him|her) with (a )?(scale|stick|belt|cane)",
    r"beats? (him|her) (up|every|daily|badly)",
    r"(marta|marti|peet(ta|ti)?) (hai|hain).{0,30}(roz|daily|har din)",
    r"bruise",
    r"marks on (his|her) (arms?|body|back|legs?)",
    r"मारपीट|पीटता|पीटती",
]

# Clause-level cues that an area is described as FINE ("reads very well", "koi dikkat nahi").
FINE_CUES = re.compile(
    r"\b(no (problem|problems|issue|issues|trouble|difficulty|difficulties|concern)s?|without (any )?(problem|trouble|difficulty)|"
    r"fine\b(?! motor)|normal|very well|reads well|good at|beautiful|excellent|is good|are good|lots of friends|has (many|a lot of|lots of) friends|best friend|"
    r"theek (hai|hain)|thik (hai|hain)|achh?[ae]|sab normal|koi (dikkat|problem|pareshani) nahi|dost bhi hain|dost hain)\b|"
    r"कोई (दिक्कत|समस्या) नहीं|ठीक है|अच्छ[ाेी]|बहुत अच्छ",
    re.IGNORECASE,
)
CLAUSE_SPLIT = re.compile(
    r"[,;.।!?]|\b(?:but|however|though|still|although|par|lekin|magar|bas|jabki)\b|लेकिन|पर |बस |मगर",
    re.IGNORECASE,
)
# a "but ..." clause that names the real concern should not inherit the fine-cue of the previous clause,
# which is why we judge every clause on its own.

_COMPILED = {k: [re.compile(p, re.IGNORECASE) for p in v] for k, v in RULES.items()}
# Safeguarding (possible abuse / unsafe adult / running away). Written from general child-protection
# vocabulary AFTER inspecting the seed list, so seed-derived safety numbers are not independent;
# see the blind set in evaluate_blind.py.
SAFETY_RULES += [
    r"(scared|afraid|terrified|frightened|fears?) (of )?(being )?(left )?alone with",
    r"alone with (one|a|an|the|his|her|that).{0,40}(tutor|teacher|uncle|man|person|driver|cousin|relative|neighbour|coach)",
    r"(older (person|boy|man|girl|kid)|someone|somebody|a (man|stranger)|tutor|uncle|teacher|driver|coach) (hurt|hit|touched|scared|threatened|beat)s? (him|her)",
    r"(an? )?(older|big) (person|boy|man) hurt",
    r"hurt (him|her) and (is|was|are) scared",
    r"will ?(not|n'?t) (say|tell) (me )?how",
    r"ran away from home|runs? away from home|ran away after|running away from home",
    r"told .{0,25}secret",
    r"does ?n'?t want to be (left )?alone with",
    r"bade (ne|logon ne|bachche ne) (use |usko )?(chot|maara|mara)",
    r"kisi ne (use |usko )?(chot|maara|mara|chua|choo)",
    r"chot pahunch",
    r"akele (rehne|baithne|jaane).{0,25}(dar|dara)",
    r"ghar se bhag",
    r"bhaag (gaya|gayi|jata|jaati)",
    r"एक बड़े ने",
    r"चोट पहुँ?चाई",
    r"अकेले.{0,25}डर",
    r"घर से भाग",
    r"किसी ने (उसे )?(मारा|चोट|छुआ)",
]
SAFETY_RULES += [
    # indirect suicidal wording (added after testing on new phrasings)
    r"(nobody|no ?one|none of us) (would|will|'?d) (miss|care|notice|even know)",
    r"(wouldn'?t|would not|won'?t) be missed",
    r"(everyone|we all|family) (would|will) be (better|happier|fine) without (him|her|me)",
    r"wish(es|ed)? (he|she|they) (was|were) never born",
    r"if (he|she) (was|were|is) (gone|not here|not around)",
    r"(wants?|wishes?|says?).{0,20}to disappear",
    r"don'?t (want|wanna) to (be here|exist)",
    r"(mere|uske|uske) bina sab (khush|theek)",
    r"na rehta to|na hota to accha",
    r"गायब हो जाना चाह",
    # abuse / unsafe touch, indirect wording
    r"touch(es|ed|ing)? (her|him|them)?.{0,25}in a way (she|he|they) (does ?n'?t|do ?n'?t|did ?n'?t) like",
    r"private parts?",
    r"inappropriate(ly)? (touch|contact|behaviou?r with)",
    r"(scared|afraid) (to go|of going) (to|for) (the )?(tuition|tutor|class(es)?|his|her|uncle|sir|coach)",
    # Hinglish self-harm / abuse
    r"apne aap ko (nuksan|chot|hurt|maar|kaat|jala)",
    r"haath (kaat|kat) (leti|leta|liya|lete)",
    r"blade se (kaat|haath)",
    r"(khud|apne ko) (kaat|jala|maar)",
    r"(ghar|school|tuition|tution|class|hostel)( mein| me)? (koi|log|sir|teacher|chacha|mama|papa|tutor|bhaiya).{0,30}(maarta|marta|maarti|peetta|peet(ta|ti)|maarte|marte|marpeet) (hai|hain)",
    r"(koi|sir|teacher|tutor|chacha|mama) (usko|use|bachche ko|bachhe ko) (maarta|marta|peetta|marte|maarte)",
    r"(maarta|marta|peetta) hai (aur|isliye).{0,25}(darta|darti|dar )",
    r"(darta|darti|dara hua|daree).{0,30}(maarta|marta|peetta)",
    r"मेरे बिना.{0,15}अच्छा|हाथ काट",
    r"घर में कोई (मारता|पीटता)",
]
SAFETY_RULES += [
    # unexplained / self-inflicted marks, Hinglish + Hindi (found via misses on the full dataset)
    r"khud se (kiye|kiya|kie|kari|ki) hue",
    r"(nishaan|nishan|daag|chot).{0,40}(batata|batati|batate) nahi",
    r"(batata|batati) nahi (ki )?(kaise|kese|kaisey) hue",
    r"(badan|baanh|bah[an]|haath|kalai|peeth|pair|body).{0,12}(par|pe|mein|me) .{0,15}(nishaan|nishan|daag|chot)",
    r"खुद से (किए|किये|किया|की)( हुए)?",
    r"(बताता|बताती) नहीं (कि )?कैसे",
    r"(बदन|शरीर|बाँह|बांह|हाथ|पीठ|कलाई).{0,12}(पर|में).{0,12}(निशान|चोट|दाग)",
    # "it would be better if I died" / "no one needs me", Hinglish + Hindi
    r"mar ja(u|oon|un|aun)n? (to|toh) (accha|achha|theek|behtar)",
    r"(meri|mujhe) (zaroorat|zarurat|jarurat) nahi",
    r"sabko meri (zaroorat|zarurat)",
    r"मर जा(ऊँ|ऊं|ऊ|उँ)",
    r"(मेरी|मुझे) (ज़रूरत|जरूरत) नहीं",
    r"सबको मेरी",
]
_SAFETY = [re.compile(p, re.IGNORECASE) for p in SAFETY_RULES]


def rule_scan(text):
    """Return ({label: [matched phrases]}, safety_matches). Clauses described as FINE are skipped."""
    hits = {}
    safety = []
    for clause in CLAUSE_SPLIT.split(text):
        if clause is None:
            continue
        c = clause.strip()
        if not c:
            continue
        for rx in _SAFETY:
            m = rx.search(c)
            if m:
                safety.append(m.group(0))
        if FINE_CUES.search(c):
            continue
        for lab, rxs in _COMPILED.items():
            for rx in rxs:
                m = rx.search(c)
                if m:
                    hits.setdefault(lab, []).append(m.group(0).strip())
                    break
    # also scan the whole text for safety, in case a clause split cut a pattern
    for rx in _SAFETY:
        m = rx.search(text)
        if m and m.group(0) not in safety:
            safety.append(m.group(0))
    return hits, safety


# Topic words, used ONLY to notice "<topic> is fine" so that a domain the parent explicitly calls fine
# is down-weighted ("Reading is fine, but he cannot sit still").
TOPIC = {
    "attention_work": r"attention|concentrat|focus|sit(ting)? still|homework|dhyan|ध्यान",
    "listening_speaking": r"speak|speech|talk|listen|understand|vocabular|\bbol(ta|ti|ne)?\b|बोल",
    "reading": r"\bread(s|ing)?\b|padh(ta|ti|ne|ai)?\b|पढ़",
    "writing": r"writ(e|es|ing|ten)|handwriting|spell|likh|लिख",
    "numbers": r"\bmath(s)?\b|number|tables|ganit|गणित",
    "motor": r"sports?|running|cycle|coordination|movement|khel|खेल|motor",
    "social": r"friends?|play(s|ing)? with|dost|दोस्त|mix(es)? with",
    "emotion_school": r"behaviou?r|mood|anger|temper|gussa|going to school|school (jata|jaata|jaane)",
    "vision_hearing": r"\beyes?\b|\bears?\b|hearing|vision|eyesight|aankh|kaan|आँख|कान",
}
_TOPIC = {k: re.compile(v, re.IGNORECASE) for k, v in TOPIC.items()}


def fine_scan(text):
    """Labels whose topic is mentioned in a clause that also says the area is fine."""
    out = set()
    for clause in CLAUSE_SPLIT.split(text):
        c = (clause or "").strip()
        if c and FINE_CUES.search(c):
            for lab, rx in _TOPIC.items():
                if rx.search(c):
                    out.add(lab)
    return out


# --------------------------------------------------------------------------- router
@dataclass
class RouteResult:
    probs: dict[str, float]
    flagged: list[str]
    domain_prior: dict[str, float]  # prior risk 0..1 for each of the 8 domains
    ruleouts: list[str]  # subset of RULEOUTS to screen
    context_flags: list[str]
    safety: bool
    safety_evidence: list[str]
    unclear: bool
    evidence: dict[str, list[str]] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


class DomainRouter:
    def __init__(
        self,
        vec: Any,
        clf: Any,
        thresholds: dict[str, float],
        safety_clf_thr: float = 0.35,
        rule_boost: bool = True,
        policy: str = "rules_primary",
    ) -> None:
        self.vec = vec
        self.clf = clf
        self.thr = thresholds  # per label
        self.safety_clf_thr = safety_clf_thr
        self.rule_boost = rule_boost
        # "rules_primary": trust a rule hit when one fires, fall back to the
        # classifier only when nothing fires. "blend": old behaviour, where the
        # classifier gates every label and rules only lift borderline scores.
        # Rules win on the independent handwritten set (F1 0.842 vs 0.667).
        self.policy = policy

    # ---- persistence
    def save(self, path: str | Path) -> None:
        joblib.dump(
            {
                "vec": self.vec,
                "clf": self.clf,
                "thr": self.thr,
                "safety_clf_thr": self.safety_clf_thr,
                "rule_boost": self.rule_boost,
                "policy": self.policy,
            },
            str(path),
        )

    @classmethod
    def load(cls, path: str | Path) -> DomainRouter:
        d = joblib.load(str(path))
        return cls(
            d["vec"],
            d["clf"],
            d["thr"],
            d["safety_clf_thr"],
            d["rule_boost"],
            d.get("policy", "rules_primary"),
        )

    # ---- inference
    def predict_proba(self, texts: Sequence[str]) -> Any:
        X = self.vec.transform(texts)
        return self.clf.predict_proba(X)

    def route(
        self, text: str, use_rules: bool = True, policy: str | None = None
    ) -> RouteResult:
        policy = policy or self.policy
        p = self.predict_proba([text])[0]
        probs = {lab: float(p[i]) for i, lab in enumerate(LABELS)}
        hits, saf = rule_scan(text) if use_rules else ({}, [])
        if use_rules:
            for lab in fine_scan(text) - set(hits):
                probs[lab] *= 0.3  # parent said this area is fine
        if use_rules and self.rule_boost:
            for lab, ph in hits.items():
                if lab in probs and lab != "safety":
                    # one hit lifts a borderline label to just over its threshold; more hits lift it more
                    floor = min(0.95, self.thr[lab] + 0.02 * len(ph))
                    if probs[lab] >= 0.5 * self.thr[lab]:
                        probs[lab] = max(probs[lab], floor)
        safety = bool(saf) or probs["safety"] >= self.safety_clf_thr

        if policy == "rules_primary" and use_rules:
            # A fired rule is the strongest signal we have. Only fall back to the
            # classifier when no rule fired at all, so we never go silent.
            flagged_set = {lab for lab in hits if lab in LABELS and lab != "safety"}
            if not flagged_set and not saf:
                flagged_set = {
                    lab
                    for lab in LABELS
                    if lab != "safety" and probs[lab] >= self.thr[lab]
                }
        else:
            flagged_set = {
                lab
                for lab in LABELS
                if lab != "safety" and probs[lab] >= self.thr[lab]
            }

        flagged = [lab for lab in LABELS if lab in flagged_set]
        domain_prior = {d: probs[d] for d in DOMAINS}
        ruleouts = [r for r in RULEOUTS if r in flagged]
        ctx = [c for c in CONTEXT if c in flagged]
        flagged_main = [d for d in DOMAINS + RULEOUTS if d in flagged]
        unclear = (not flagged_main) and (not safety)
        return RouteResult(
            probs=probs,
            flagged=flagged,
            domain_prior=domain_prior,
            ruleouts=ruleouts,
            context_flags=ctx,
            safety=safety,
            safety_evidence=saf,
            unclear=unclear,
            evidence=hits,
        )
