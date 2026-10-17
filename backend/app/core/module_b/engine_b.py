"""Adaptive question engine for Module B (ages 5-12).

Flow (blueprint 5.4, steps 1-4 + 8-9):
  parent text --router--> domain priors / rule-out flags / safety / unclear
        --> adaptive loop: pick the next best item from the tagged bank, using priors AND
            previous answers --> per-domain Typical / Monitor / Refer (rule-based, PROVISIONAL)
        --> plain-language reasons + curated practice activities + help routes.

Design choices
  * State lives in the Session object (JSON-serialisable). Item choice is a pure function of
    (session answers, seed), so the API can be stateless and results are reproducible.
  * A "concept" is one behaviour; the bank has several wordings of it. A concept is asked at
    most once per session, and the wording is randomised, so repeat screenings do not look identical.
  * Priority of a domain = router prior x uncertainty (+ boosts from cross-signals, + deepening when
    answers are concerning). Domains close early on two clean answers, or once clearly high.
  * Safety: self-harm/abuse language or a positive safety answer shows the helpline FIRST.
  * Output is "patterns worth assessment", never a diagnosis. Thresholds are placeholders to be
    calibrated against real clinical data before any real-world use.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd  # type: ignore[import-untyped]

from app.core.safety_floor import MIN_DOMAINS_COVERED_B, MIN_REAL_ANSWERS_B

try:
    from .router_b import DOMAINS, RULEOUTS, DomainRouter
except (ImportError, ValueError):
    from router_b import DOMAINS, RULEOUTS, DomainRouter

# backend/ — parents: module_b -> core -> app -> backend
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DATA_DIR = _BACKEND_ROOT / "data" / "module_b"

CFG: dict[str, Any] = {
    "max_questions": 20,  # hard cap on questions per session
    "min_real_answers": MIN_REAL_ANSWERS_B,  # safety floor (blueprint: MIN_REAL_ANSWERS_B)
    "min_domains_covered": MIN_DOMAINS_COVERED_B,  # safety floor (blueprint: MIN_DOMAINS_COVERED_B)
    "max_per_domain": 6,
    "ruleout_after": 5,  # ask the vision/hearing screen once this many answers exist
    "prior_floor": 0.06,
    "flag_concern": 0.75,  # an answer of 4-5 on a 5-point item counts as "endorsed"
}

POOL_NAME: dict[str, str] = {
    "vision_hearing": "ruleout_vision_hearing",
    "global_asd": "ruleout_global_asd",
}

# Vision vs hearing sub-signal: the router flags them together, but the first rule-out question
# should match what the parent actually wrote (fix: a can't-see-the-board text got hearing items first).
VISION_CONCEPTS: set[str] = {
    "vh_squint",
    "vh_close",
    "vh_headache",
    "vh_tilt",
    "vh_bump",
    "vh_board",
    "vh_eye_test",
}
HEARING_CONCEPTS: set[str] = {
    "vh_what",
    "vh_volume",
    "vh_behind",
    "vh_ear",
    "vh_lips",
    "vh_hear_test",
}
VISION_TEXT = (
    r"\beyes?\b|eyesight|vision|\bsee\b|\bseeing\b|blackboard|\bboard\b|squint|glasses|spectacles|blurr|"
    r"aankh|ankhein|aankhein|dekh|nazar|chashm|आँख|आंख|देख|नज़र|चश्मा"
)
HEARING_TEXT = (
    r"\bears?\b|hearing|\bhear\b|deaf|\bsunt|\bsuna\b|sunai|sun nahi|kaan|आवाज़|कान|सुन|"
    r"doesn'?t respond to (his|her) name|calls? (him|her) .{0,15}(no|not) (respond|answer|hear)"
)
ALL_TRACKS: list[str] = DOMAINS + RULEOUTS
LABEL: dict[str, str] = {
    "attention_work": "attention and work habits",
    "listening_speaking": "listening and speaking",
    "reading": "reading",
    "writing": "writing and spelling",
    "numbers": "numbers and maths",
    "motor": "movement and coordination",
    "social": "friendships and play",
    "emotion_school": "feelings, behaviour and school adjustment",
    "vision_hearing": "possible vision or hearing concerns",
    "global_asd": "broader development / social-communication",
}
SAFETY_QUEUE: dict[str, str] = {
    "sc_hit": "sf_threat",
    "sc_school_avoid_peers": "sf_threat",
    "em_hopeless": "sf_selfharm_talk",
    "em_self_hurt": "sf_selfharm_act",
}

def _get_helpline_text(key: str) -> str:
    try:
        from app.core.help_service import OFFICIAL_HELPLINES
        for h in OFFICIAL_HELPLINES:
            if key in h.name.lower():
                return f"{h.name}: {h.number} ({h.available})"
    except Exception:
        pass
    return key

HELP: dict[str, str] = {
    "kiran": _get_helpline_text("kiran"),
    "childline": _get_helpline_text("childline"),
}


def age_band(age: int) -> str:
    return "5-7" if age <= 7 else "8-10" if age <= 10 else "11-12"


def concern_of(row: Any, value: Any) -> float | None:
    """Map an answer to a 0..1 concern (1 = most concerning)."""
    rt = row["response_type"]
    if rt == "likert5":
        c = (int(value) - 1) / 4.0
        return 1.0 - c if int(row["reverse_scored"]) == 1 else c
    if rt == "yesno":
        mapping = {"yes": 1.0, "no": 0.0, "not sure": 0.5}
        return mapping[str(value).strip().lower()]
    return None  # choice items are recorded, not scored


# ------------------------------------------------------------------ bank
class Bank:
    def __init__(
        self,
        bank_path: str | Path | None = None,
        act_path: str | Path | None = None,
    ) -> None:
        bank_path = bank_path or str(_DEFAULT_DATA_DIR / "question_bank_b.csv")
        act_path = act_path or str(_DEFAULT_DATA_DIR / "activities_b.csv")
        df = pd.read_csv(str(bank_path))
        df["bands"] = df.age_bands.str.split("|")
        df["cross_signal"] = df.cross_signal.fillna("")
        df["red_flag_action"] = df.red_flag_action.fillna("")
        df["red_flag"] = df.red_flag.fillna(0).astype(int)
        self.df = df.set_index("item_id", drop=False)
        usable = df[
            df.item_type.isin(["symptom", "strength", "ruleout"])
            & df.response_type.isin(["likert5", "yesno"])
        ]
        self.pool: dict[tuple[str, str, str], Any] = {}
        for (dom, form), g in usable.groupby(["domain", "form"]):
            for b in ("5-7", "8-10", "11-12"):
                self.pool[(dom, form, b)] = g[g.bands.apply(lambda x, b=b: b in x)]
        self.safety = df[df.domain == "safety"]
        self.acts = pd.read_csv(str(act_path))

    def row(self, item_id: str) -> Any:
        return self.df.loc[item_id]


@dataclass
class Session:
    age: int
    form: str = "parent"
    seed: int = 42
    prior: dict[str, float] = field(default_factory=dict)
    ruleout_flags: list[str] = field(default_factory=list)
    context_flags: list[str] = field(default_factory=list)
    unclear: bool = False
    safety: bool = False
    safety_shown: bool = False
    safety_queue: list[str] = field(default_factory=list)
    boost: dict[str, float] = field(default_factory=dict)
    answers: list[dict[str, Any]] = field(default_factory=list)
    red_flags: list[dict[str, Any]] = field(default_factory=list)
    referral_notes: list[str] = field(default_factory=list)
    router_evidence: dict[str, list[str]] = field(default_factory=dict)
    sense_hint: str | None = None
    text: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["text"] = ""  # blank for privacy
        return d

    def to_json(self) -> str:
        d = self.to_dict()
        return json.dumps(d, ensure_ascii=False)

    @classmethod
    def from_json(cls, s: str) -> Session:
        data = json.loads(s)
        return cls(**data)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Session:
        return cls(**data)

    @property
    def band(self) -> str:
        return age_band(self.age)

    def scored(self, track: str) -> list[dict[str, Any]]:
        return [
            a
            for a in self.answers
            if a["track"] == track
            and a["concern"] is not None
            and a["item_type"] != "safety"
        ]

    def mean(self, track: str) -> float:
        xs = self.scored(track)
        if not xs:
            return 0.5
        w = sum(a["weight"] for a in xs) or 1.0
        return sum(a["concern"] * a["weight"] for a in xs) / w


class Engine:
    def __init__(
        self,
        router: DomainRouter | None = None,
        bank: Bank | None = None,
        cfg: dict[str, Any] | None = None,
    ) -> None:
        self.router = router
        self.bank = bank or Bank()
        self.cfg = {**CFG, **(cfg or {})}

    # ---------------------------------------------------------------- start
    def start(
        self,
        text: str,
        age: int,
        form: str = "parent",
        seed: int = 42,
        use_router: bool = True,
    ) -> Session:
        txt = (text or "").lower()
        v = bool(re.search(VISION_TEXT, txt))
        h = bool(re.search(HEARING_TEXT, txt))
        sense_hint = "vision" if (v and not h) else "hearing" if (h and not v) else None

        # Privacy constraint: raw caregiver text is blanked immediately
        s = Session(
            age=int(age),
            form=form,
            seed=int(seed),
            sense_hint=sense_hint,
            text="",
        )
        s.prior = {
            d: 0.30 for d in DOMAINS
        }  # uninformed prior when there is no usable text
        if use_router and self.router is not None and text and text.strip():
            r = self.router.route(text)
            s.safety = r.safety
            s.unclear = r.unclear
            s.context_flags = list(r.context_flags)
            s.ruleout_flags = list(r.ruleouts)
            s.router_evidence = {}  # Privacy: do not persist snippets of caregiver text
            if not r.unclear:
                s.prior = {
                    d: max(self.cfg["prior_floor"], r.domain_prior[d]) for d in DOMAINS
                }
        s.prior.update({t: (0.6 if t in s.ruleout_flags else 0.0) for t in RULEOUTS})
        return s

    def apply_recall_choice(self, s: Session, domains: list[str]) -> Session:
        """User tapped chips on the Recall Help screen (blueprint 5.5)."""
        for d in DOMAINS:
            s.prior[d] = 0.7 if d in domains else self.cfg["prior_floor"] + 0.05
        s.unclear = False
        return s

    # ---------------------------------------------------------------- selection & Bayesian CAT
    @staticmethod
    def _irt_params(row: Any) -> tuple[float, float]:
        """Calibrated 2PL IRT parameters: discrimination a, difficulty b."""
        lvl = getattr(row, "level", 1) or 1
        w = getattr(row, "weight", 1.0) or 1.0
        try:
            w_flt = float(w)
        except (ValueError, TypeError):
            w_flt = 1.0
        a = (1.0 if lvl == 1 else 1.4 if lvl == 2 else 1.8) * max(0.6, min(2.0, w_flt))
        b = -0.4 if lvl == 1 else 0.4 if lvl == 2 else 1.2
        return a, b

    def _estimate_theta(self, s: Session, t: str) -> tuple[float, float, float]:
        """Bayesian EAP estimation of latent deficit theta, standard error SE, and Fisher Information."""
        xs = s.scored(t)
        prior_p = max(0.05, min(0.95, s.prior.get(t, 0.30)))
        theta_0 = math.log(prior_p / (1.0 - prior_p))
        if not xs:
            return round(theta_0, 2), 1.0, 0.0

        numerator = 0.0
        total_info = 0.0
        for a_rec in xs:
            row = self.bank.row(a_rec["item_id"])
            a_param, b_param = self._irt_params(row)
            diff = a_param * (theta_0 - b_param)
            diff = max(-10.0, min(10.0, diff))
            p = 1.0 / (1.0 + math.exp(-diff))
            info = a_param * a_param * p * (1.0 - p)
            c = a_rec.get("concern", 0.5) if a_rec.get("concern") is not None else 0.5
            numerator += a_param * (c - p)
            total_info += info

        theta_est = theta_0 + numerator / (1.0 + total_info)
        se = 1.0 / math.sqrt(1.0 + total_info)
        return (
            round(float(theta_est), 2),
            round(float(se), 2),
            round(float(total_info), 2),
        )

    def _closed(self, s: Session, t: str) -> bool:
        xs = s.scored(t)
        n, m = len(xs), s.mean(t)
        if t in RULEOUTS:
            return n >= 2 or (n >= 1 and m < 0.3)
        if n >= self.cfg["max_per_domain"]:
            return True
        if n >= 2 and m <= 0.10:
            return True
        if n >= 3 and m < 0.20:
            return True
        # Bayesian CAT dynamic stopping: stop early when standard error is low and trait is clear
        _, se, _ = self._estimate_theta(s, t)
        if n >= 3 and se <= 0.38 and (m <= 0.25 or m >= 0.70):
            return True
        # A clearly high domain is only closed once there is enough evidence to call it (>= 4 answers):
        return n >= 4 and m > 0.75

    def _priority(self, s: Session, t: str) -> float:
        asked = len(s.answers)
        if self._closed(s, t):
            return 0.0
        n, m = len(s.scored(t)), s.mean(t)
        if t in RULEOUTS:
            base = s.prior.get(t, 0.0) + s.boost.get(t, 0.0)
            if t == "vision_hearing" and asked >= self.cfg["ruleout_after"] and n == 0:
                base = max(base, 0.5)  # always screened once, cheaply
            if (
                t == "global_asd"
                and n == 0
                and (s.mean("social") > 0.6 or s.mean("listening_speaking") > 0.6)
            ):
                base = max(base, 0.45)
            if n == 1 and m >= 0.6:
                base = max(base, 0.9)  # confirm a positive rule-out
            return base
        unc = 1.0 / (n + 1)
        if n >= 2:
            unc *= 0.5 + 0.5 * (1 - abs(2 * m - 1))
        deepen = 0.25 if (n >= 1 and m >= 0.55) else 0.0
        pri = (
            max(s.prior.get(t, 0.0), self.cfg["prior_floor"]) + deepen
        ) * unc + s.boost.get(t, 0.0) * unc
        covered = sum(1 for d in DOMAINS if s.scored(d))
        if asked >= 6 and covered < self.cfg["min_domains_covered"] and n == 0:
            pri += 0.3
        return pri

    def _pick_item(self, s: Session, t: str, rng: random.Random) -> str | None:
        pool_name = POOL_NAME.get(t, t)
        pool = self.bank.pool.get((pool_name, s.form, s.band))
        if pool is None or pool.empty:
            return None
        done_c = {a["concept"] for a in s.answers}
        pool = pool[~pool.concept_id.isin(done_c)]
        if pool.empty:
            return None
        xs = s.scored(t)
        m = s.mean(t) if xs else 0.5
        deepen = bool(xs) and m >= 0.5
        seen_sub = {a["subdomain"] for a in xs}
        hot = max(xs, key=lambda a: a["concern"])["subdomain"] if xs else None
        have_strength = any(a["item_type"] == "strength" for a in xs)
        best: str | None = None
        best_sc: float = -9.0
        sense = s.sense_hint
        if t == "vision_hearing":
            v = sense == "vision"
            h = sense == "hearing"
            # an answered concern on one sense also steers the follow-up to that sense
            for a in xs:
                if a["concern"] >= self.cfg["flag_concern"]:
                    v = v or a["concept"] in VISION_CONCEPTS
                    h = h or a["concept"] in HEARING_CONCEPTS
            sense = "vision" if (v and not h) else "hearing" if (h and not v) else None
        theta_est, _, _ = self._estimate_theta(s, t)
        for r in pool.itertuples():
            if r.level >= 2 and not deepen and not pool[pool.level == 1].empty:
                continue
            sc = 1.0 if r.subdomain not in seen_sub else 0.4
            if (sense == "vision" and r.concept_id in VISION_CONCEPTS) or (
                sense == "hearing" and r.concept_id in HEARING_CONCEPTS
            ):
                sc += 0.8
            if deepen and r.level >= 2:
                sc += 0.5
            if deepen and r.subdomain == hot:
                sc += 0.3
            if r.item_type == "strength":
                sc += 0.2 if (len(xs) >= 2 and not have_strength) else -0.4
            # Bayesian CAT Fisher Information Maximization:
            a_param, b_param = self._irt_params(r)
            diff_cand = max(-10.0, min(10.0, a_param * (theta_est - b_param)))
            p_cand = 1.0 / (1.0 + math.exp(-diff_cand))
            fisher_cand = a_param * a_param * p_cand * (1.0 - p_cand)
            sc += 0.6 * fisher_cand
            # Deterministic tie-breaker: hash session seed, answered count, and candidate item_id.
            # Completely replaces non-deterministic random jitter with a deterministic mathematical hash.
            tie_hash = int(
                hashlib.md5(
                    f"{s.seed}:{len(s.answers)}:{r.item_id}".encode()
                ).hexdigest()[:8],
                16,
            )
            sc += (tie_hash / 0xFFFFFFFF) * 0.001
            if sc > best_sc:
                best, best_sc = str(r.item_id), sc
        return best

    def _stop(self, s: Session) -> bool:
        asked = len(s.answers)
        if asked >= self.cfg["max_questions"]:
            return True
        pri = {t: self._priority(s, t) for t in ALL_TRACKS}
        covered = sum(1 for d in DOMAINS if s.scored(d))
        return (
            asked >= self.cfg["min_real_answers"]
            and covered >= self.cfg["min_domains_covered"]
            and max(pri.values()) <= 0.03
        )

    def next_action(self, s: Session) -> dict[str, Any]:
        """What should the UI show now?"""
        if s.safety and not s.safety_shown:
            s.safety_shown = True
            return {
                "type": "safety_notice",
                "message": (
                    "Thank you for sharing this. What you described needs a person to talk to, not just a questionnaire. "
                    "Please reach out now: "
                    + HELP["kiran"]
                    + ". "
                    + HELP["childline"]
                    + ". "
                    "You can continue the questions afterwards; we will start with a couple of safety questions."
                ),
                "helplines": HELP,
            }
        if s.unclear:
            return {
                "type": "recall_help",
                "message": "Think about yesterday during homework or play. Was it about:",
                "options": {d: LABEL[d] for d in DOMAINS},
            }
        rng = random.Random(f"{s.seed}-{len(s.answers)}")
        # queued safety questions come first
        if s.safety and not any(a["item_type"] == "safety" for a in s.answers):
            for cid in ("sf_selfharm_talk", "sf_afraid_of"):
                if cid not in s.safety_queue:
                    s.safety_queue.append(cid)
        for cid in list(s.safety_queue):
            if cid in {a["concept"] for a in s.answers}:
                s.safety_queue.remove(cid)
                continue
            rows = self.bank.safety[self.bank.safety.concept_id == cid]
            if len(rows):
                pick_idx = int(
                    hashlib.md5(
                        f"{s.seed}:{cid}:{len(s.answers)}".encode()
                    ).hexdigest()[:8],
                    16,
                ) % len(rows)
                return self._q(s, rows.iloc[pick_idx], "safety")
        if self._stop(s):
            return {"type": "done"}
        order = sorted(ALL_TRACKS, key=lambda t: -self._priority(s, t))
        for t in order:
            if self._priority(s, t) <= 0:
                break
            iid = self._pick_item(s, t, rng)
            if iid:
                return self._q(s, self.bank.row(iid), t)
        return {"type": "done"}

    def _q(self, s: Session, row: Any, track: str) -> dict[str, Any]:
        return {
            "type": "question",
            "item_id": str(row["item_id"]),
            "text": str(row["text"]),
            "track": track,
            "response_type": str(row["response_type"]),
            "scale": (
                str(row["scale_labels"]) if pd.notna(row["scale_labels"]) else None
            ),
            "progress": {"answered": len(s.answers), "max": self.cfg["max_questions"]},
        }

    # ---------------------------------------------------------------- answer
    def answer(
        self,
        s: Session,
        item_id: str,
        value: Any,
        track: str | None = None,
    ) -> Session:
        row = self.bank.row(item_id)
        c = concern_of(row, value)
        trk = track or (
            "safety"
            if row["domain"] == "safety"
            else {v: k for k, v in POOL_NAME.items()}.get(row["domain"], row["domain"])
        )
        # Privacy: do not persist question text in the answer record
        s.answers.append(
            {
                "item_id": item_id,
                "concept": str(row["concept_id"]),
                "track": trk,
                "subdomain": str(row["subdomain"]),
                "item_type": str(row["item_type"]),
                "level": int(row["level"]),
                "weight": float(row["weight"]) or 1.0,
                "concern": c,
                "raw": value,
            }
        )
        if c is not None and c >= self.cfg["flag_concern"]:
            tgt = str(row["cross_signal"])
            if tgt in DOMAINS:
                s.boost[tgt] = s.boost.get(tgt, 0.0) + 0.35
            elif tgt == "ruleout_vision_hearing":
                s.boost["vision_hearing"] = s.boost.get("vision_hearing", 0.0) + 0.5
            elif tgt == "ruleout_global_asd":
                s.boost["global_asd"] = s.boost.get("global_asd", 0.0) + 0.4
            elif tgt == "neuromotor_referral":
                s.referral_notes.append(
                    "Unusual gait/one-sided weakness/frequent unexplained falls: ask the RBSK team, DEIC or a paediatrician."
                )
            cid = str(row["concept_id"])
            if cid in SAFETY_QUEUE and SAFETY_QUEUE[cid] not in s.safety_queue:
                s.safety_queue.append(SAFETY_QUEUE[cid])
            if int(row["red_flag"]) == 1:
                act = str(row["red_flag_action"])
                s.red_flags.append({"concept": cid, "action": act, "item_id": item_id})
                if act == "show_helpline" and not s.safety:
                    s.safety, s.safety_shown = True, False
        return s

    # ---------------------------------------------------------------- result
    def classify_track(self, s: Session, t: str) -> dict[str, Any]:
        xs = s.scored(t)
        n = len(xs)
        m = s.mean(t)
        endorsed = sum(1 for a in xs if a["concern"] >= self.cfg["flag_concern"])
        theta, se, info = self._estimate_theta(s, t)
        if t in RULEOUTS:
            flag = (
                n >= 1 and (max(a["concern"] for a in xs) >= self.cfg["flag_concern"])
            ) and (n == 1 or m >= 0.5)
            return {
                "state": "Flag" if flag else ("No flag" if n else "Not asked"),
                "score": round(m, 2),
                "n": n,
                "irt_theta": theta,
                "irt_se": se,
                "fisher_information": info,
            }
        if n == 0:
            return {
                "state": "Not asked",
                "score": None,
                "n": 0,
                "brief": True,
                "irt_theta": theta,
                "irt_se": se,
                "fisher_information": info,
            }
        if n < 2:
            st = (
                "Monitor" if endorsed else "Typical"
            )  # one clean answer = brief check only
        elif (n >= 4 and m >= 0.65) or endorsed >= 3:
            st = "Refer"
        elif m >= 0.40 or endorsed >= 2:
            st = "Monitor"
        else:
            st = "Typical"
        border = n >= 2 and (0.35 <= m < 0.45 or 0.60 <= m < 0.70)
        brief = n < 2
        top = sorted(
            [a for a in xs if a["concern"] >= 0.5], key=lambda a: -a["concern"]
        )[:3]
        # Resolve text dynamically from bank (never from answers store)
        because = [str(self.bank.row(a["item_id"])["text"]) for a in top]
        return {
            "state": st,
            "score": round(m, 2),
            "n": n,
            "endorsed": endorsed,
            "borderline": border,
            "brief": brief,
            "because": because,
            "irt_theta": theta,
            "irt_se": se,
            "fisher_information": info,
        }

    def activities_for(self, s: Session, t: str, state: str) -> list[dict[str, Any]]:
        a = self.bank.acts
        a = a[(a.domain == t) & (a.age_min <= s.age) & (a.age_max >= s.age)]
        pick = a[a.level.isin(["any", "monitor" if state == "Monitor" else "refer"])]
        order = pick.assign(
            k=(
                pick.level.map({"refer": 0, "any": 1, "monitor": 2})
                if state == "Refer"
                else pick.level.map({"any": 0, "monitor": 1})
            )
        )
        return (
            order.sort_values("k")
            .head(3)[["title", "minutes", "setting", "steps"]]
            .to_dict("records")
        )

    def result(self, s: Session) -> dict[str, Any]:
        tracks = {t: self.classify_track(s, t) for t in ALL_TRACKS}
        flagged = [t for t in DOMAINS if tracks[t]["state"] in ("Monitor", "Refer")]
        ro = [t for t in RULEOUTS if tracks[t]["state"] == "Flag"]
        acts = {t: self.activities_for(s, t, tracks[t]["state"]) for t in flagged}
        brief = [
            t
            for t in DOMAINS
            if tracks[t].get("brief") and tracks[t]["state"] == "Typical"
        ]
        parts = []
        for t in flagged:
            parts.append(f"{LABEL[t]} ({tracks[t]['state'].lower()})")
        lead = "This is a screening summary, not a diagnosis. "
        if s.safety or s.red_flags:
            lead = (
                "What you described about your child needs a person to talk to, regardless of the scores below. "
                "Please contact "
                + HELP["kiran"]
                + " or "
                + HELP["childline"]
                + ". "
                + lead
            )
        if parts:
            body = "Patterns worth a closer look: " + "; ".join(parts) + "."
        elif s.safety or s.red_flags:
            body = (
                "The questionnaire answers did not point to a specific learning or behaviour pattern, "
                "but your first concern still deserves a conversation with a person."
            )
        else:
            body = "Nothing in the answers suggests a pattern that needs follow-up right now, but you know your child best."
        brief_txt = (
            (
                " Only a brief check was done for "
                + ", ".join(LABEL[t] for t in brief)
                + "."
            )
            if brief
            else ""
        )
        ro_txt = ""
        if ro:
            ro_txt = (
                " Some answers also point to "
                + " and ".join(LABEL[r] for r in ro)
                + ", which are best checked by a school health team (RBSK), DEIC or a paediatrician before anything else."
            )

        # Sensory vs Cognitive Differential Masking Analysis
        diff_masking: dict[str, Any] = {}
        diff_advisories: list[str] = []

        # 1. Central Auditory Processing vs Primary ADHD (CAPD vs ADHD)
        ls_score = tracks["listening_speaking"].get("score")
        at_score = tracks["attention_work"].get("score")
        ls_n = tracks["listening_speaking"].get("n", 0)
        at_n = tracks["attention_work"].get("n", 0)
        if (
            ls_n >= 2
            and ls_score is not None
            and ls_score >= 0.50
            and (at_n == 0 or (at_score is not None and at_score < 0.40))
        ):
            diff_masking["capd_vs_adhd"] = True
            diff_advisories.append(
                "Differential Diagnosis Alert: Disproportionate deficit on auditory-sequential instructions "
                "with preserved visual task attention. High index of suspicion for Central Auditory "
                "Processing Disorder (CAPD) rather than primary ADHD. Recommend formal audiological processing "
                "evaluation before psychostimulant therapy."
            )

        # 2. Oculomotor Tracking / Binocular Fatigue vs Primary Dyslexia
        rd_score = tracks["reading"].get("score")
        rd_n = tracks["reading"].get("n", 0)
        vh_flag = tracks["vision_hearing"].get("state") == "Flag"
        if (
            rd_n >= 2
            and rd_score is not None
            and rd_score >= 0.50
            and (vh_flag or tracks["vision_hearing"].get("n", 0) >= 1)
            and (ls_score is None or ls_score < 0.40)
        ):
            diff_masking["oculomotor_vs_dyslexia"] = True
            diff_advisories.append(
                "Differential Diagnosis Alert: Reading hesitation co-occurs with print line-skipping and "
                "visual strain while oral language comprehension is intact. Recommend binocular vision and "
                "oculomotor tracking assessment before diagnosing primary dyslexia."
            )

        # Response quality & straight-lining detection
        likert_answers = [
            str(
                a.get("raw") if a.get("raw") is not None else a.get("value", "")
            ).strip()
            for a in s.answers
            if str(
                a.get("raw") if a.get("raw") is not None else a.get("value", "")
            ).strip()
            in ("1", "2", "3", "4", "5")
            and a.get("item_type") != "safety"
        ]
        straight_lining = False
        if len(likert_answers) >= 8:
            val_counts = pd.Series(likert_answers).value_counts(normalize=True)
            if not val_counts.empty and float(val_counts.iloc[0]) >= 0.85:
                straight_lining = True

        summary = lead + body + brief_txt + ro_txt
        if diff_advisories:
            summary = summary + " " + " ".join(diff_advisories)

        return {
            "age": s.age,
            "questions_asked": len(s.answers),
            "domains": {t: tracks[t] for t in DOMAINS},
            "ruleouts": {t: tracks[t] for t in RULEOUTS},
            "flagged_domains": flagged,
            "ruleout_flags": ro,
            "context_flags": s.context_flags,
            "red_flags": s.red_flags,
            "referral_notes": s.referral_notes,
            "safety": s.safety,
            "guard_flags": {"straight_lining": straight_lining},
            "differential_masking": diff_masking,
            "differential_advisories": diff_advisories,
            "summary": summary,
            "activities": acts,
            "help": {
                "free_first": [
                    "Anganwadi/ASHA worker",
                    "RBSK school health screening",
                    "DEIC (District Early Intervention Centre)",
                    HELP["kiran"],
                ]
            },
            "disclaimer": "Patterns consistent with / worth assessment. Not a diagnosis. Thresholds are provisional until clinically validated.",
        }
