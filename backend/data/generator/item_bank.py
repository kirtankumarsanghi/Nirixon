"""
Stage 1 — Item Bank

Defines the 36 milestone items (6 domains x 6 items). Each item is a
concrete, countable behavior, answered on a 0 / 1-2 / 3+ times-in-the-
past-week scale (coded 0 / 1 / 2), per the design doc's frequency-based
response scale (chosen over a vague "how often" mastery scale to reduce
recall and social-desirability distortion).

Each item carries the metadata the rest of the pipeline depends on:
  - domain: which of the 6 developmental domains it belongs to
  - typical_age_months: the rough age at which a *typical* child starts
    passing this item most of the time (drives age-staggered difficulty)
  - motor_confound: True if a child's performance on this item can be
    suppressed by unrelated motor demands, independent of the domain it
    nominally measures (Section 4, Stage 3's confound caveat)
  - live_elicitation_eligible: True if this item could later be asked as
    a guided live activity instead of a retrospective recall question
    (Stage 7's Live Elicitation Mode). Nothing acts on this flag yet in
    Stage 1/2 beyond recording it in the data dictionary.
  - valid_brackets: tuple of bracket labels (from age_brackets.py) for
    which this item is developmentally valid as a screening question.
    Items can be valid across multiple adjacent brackets — a milestone
    that typically emerges at 14 months may still be a useful
    discriminator at 12 and 15 months. The adaptive engine uses this
    to avoid serving age-inappropriate items.
  - bracket_assignment_unconfirmed: True for items whose typical_age_months
    falls near a bracket boundary and whose bracket assignment is an
    engineering estimate, NOT a clinically validated decision.

    *** CLINICAL REVIEW REQUIRED ***
    Items with bracket_assignment_unconfirmed=True MUST be reviewed by a
    licensed pediatrician or child-development specialist before the system
    is deployed in any clinical or near-clinical capacity (Stages 6+).
    This is a hard external dependency — engineering cannot resolve it.
    See the implementation plan for the resourcing note.

DOMAINS are intentionally the 6 standard developmental screening
domains used by instruments like the ASQ-3, so the item bank reads as
recognizable rather than invented.
"""

from dataclasses import dataclass, field

DOMAINS = [
    "gross_motor",
    "fine_motor",
    "communication",
    "cognitive",
    "personal_social",
    "self_help",
]


@dataclass(frozen=True)
class Item:
    item_id: str
    domain: str
    text: str
    typical_age_months: float  # age at which ~50% of typical children pass
    motor_confound: bool
    live_elicitation_eligible: bool
    # ASQ-3-style bracket labels this item is valid for (from age_brackets.py).
    # Tuple of strings, e.g. ("12mo", "15mo"). Must be non-empty.
    valid_brackets: tuple[str, ...] = field(default_factory=tuple)
    # True = engineering estimate near a bracket boundary; needs clinical sign-off.
    bracket_assignment_unconfirmed: bool = False


# ---------------------------------------------------------------------------
# 36 items: 6 per domain, ages staggered across 0-60 months so difficulty is
# realistically spread out rather than clustered at one age.
# ---------------------------------------------------------------------------

ITEM_BANK: list[Item] = [
    # --- Gross motor (6) ---
    #
    # GM01: typical_age=2mo — squarely in the 2mo bracket (0–3mo).
    Item(
        "GM01",
        "gross_motor",
        "How many times in the past week has your child lifted their head while lying on their tummy?",
        2,
        False,
        True,
        valid_brackets=("2mo",),
        bracket_assignment_unconfirmed=False,
    ),
    # GM02: typical_age=5mo — 4mo bracket (3–5mo) is upper edge; valid into 6mo too.
    Item(
        "GM02",
        "gross_motor",
        "How many times in the past week has your child rolled from tummy to back or back to tummy?",
        5,
        False,
        True,
        valid_brackets=("4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # GM03: typical_age=8mo — 9mo bracket (7.5–10.5mo); also valid at 6mo end.
    Item(
        "GM03",
        "gross_motor",
        "How many times in the past week has your child sat without support for a few minutes?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # GM04: typical_age=11mo — in the 12mo bracket (10.5–13.5mo). Near boundary.
    # *** CLINICAL REVIEW REQUIRED *** — 11 months is close to the 9mo/12mo boundary.
    Item(
        "GM04",
        "gross_motor",
        "How many times in the past week has your child pulled themselves up to stand?",
        11,
        False,
        True,
        valid_brackets=("9mo", "12mo"),
        bracket_assignment_unconfirmed=True,  # 11mo is near 9mo/12mo boundary
    ),
    # GM05: typical_age=14mo — 15mo bracket (13.5–16.5mo); also valid at 12mo.
    # *** CLINICAL REVIEW REQUIRED *** — walking onset varies 12–15mo.
    Item(
        "GM05",
        "gross_motor",
        "How many times in the past week has your child walked a few steps without holding on?",
        14,
        False,
        True,
        valid_brackets=("12mo", "15mo"),
        bracket_assignment_unconfirmed=True,  # walking onset ranges 12–15mo
    ),
    # GM06: typical_age=30mo — 30mo bracket (28.5–31.5mo).
    Item(
        "GM06",
        "gross_motor",
        "How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time?",
        30,
        False,
        True,
        valid_brackets=("27mo", "30mo", "33mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # --- Fine motor (6) ---
    #
    # FM01: typical_age=3mo — 4mo bracket (3–5mo). At the exact lower edge.
    # *** CLINICAL REVIEW REQUIRED *** — 3mo is the boundary between 2mo and 4mo brackets.
    Item(
        "FM01",
        "fine_motor",
        "How many times in the past week has your child brought their hands together at the middle of their body?",
        3,
        False,
        True,
        valid_brackets=("2mo", "4mo"),
        bracket_assignment_unconfirmed=True,  # 3mo sits exactly on 2mo/4mo boundary
    ),
    # FM02: typical_age=5mo — 4mo bracket upper end / 6mo lower end.
    # *** CLINICAL REVIEW REQUIRED *** — 5mo straddles 4mo (3–5mo) and 6mo (5–7.5mo).
    Item(
        "FM02",
        "fine_motor",
        "How many times in the past week has your child reached for and grabbed a nearby toy?",
        5,
        False,
        True,
        valid_brackets=("4mo", "6mo"),
        bracket_assignment_unconfirmed=True,  # 5mo is on 4mo/6mo boundary
    ),
    # FM03: typical_age=8mo — 9mo bracket (7.5–10.5mo).
    Item(
        "FM03",
        "fine_motor",
        "How many times in the past week has your child passed a toy from one hand to the other?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # FM04: typical_age=11mo — 12mo bracket (10.5–13.5mo). Near 9mo boundary.
    # *** CLINICAL REVIEW REQUIRED *** — pincer grasp onset ranges 9–12mo.
    Item(
        "FM04",
        "fine_motor",
        "How many times in the past week has your child picked up a small object using thumb and finger?",
        11,
        False,
        True,
        valid_brackets=("9mo", "12mo"),
        bracket_assignment_unconfirmed=True,  # pincer grasp onset varies 9–12mo
    ),
    # FM05: typical_age=18mo — 18mo bracket (16.5–19.5mo).
    Item(
        "FM05",
        "fine_motor",
        "How many times in the past week has your child scribbled with a crayon on paper?",
        18,
        False,
        True,
        valid_brackets=("15mo", "18mo", "21mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # FM06: typical_age=20mo — 21mo bracket (19.5–22.5mo). motor_confound flagged.
    Item(
        "FM06",
        "fine_motor",
        "How many times in the past week has your child stacked two or more small blocks?",
        20,
        True,
        True,
        valid_brackets=("18mo", "21mo"),
        bracket_assignment_unconfirmed=False,
    ),  # tagged motor_confound: also used to probe cognitive/problem-solving
    # --- Communication (6) ---
    #
    # CM01: typical_age=2mo — 2mo bracket.
    Item(
        "CM01",
        "communication",
        "How many times in the past week has your child made cooing or gurgling sounds?",
        2,
        False,
        False,
        valid_brackets=("2mo", "4mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM02: typical_age=4mo — 4mo bracket (3–5mo).
    Item(
        "CM02",
        "communication",
        "How many times in the past week has your child turned toward a familiar voice or sound?",
        4,
        False,
        False,
        valid_brackets=("4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM03: typical_age=8mo — 9mo bracket.
    Item(
        "CM03",
        "communication",
        "How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')?",
        8,
        False,
        False,
        valid_brackets=("6mo", "9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM04: typical_age=12mo — 12mo bracket (10.5–13.5mo). Canonical first-word age.
    # *** CLINICAL REVIEW REQUIRED *** — first meaningful word ranges 10–14mo.
    Item(
        "CM04",
        "communication",
        "How many times in the past week has your child said a clear word with meaning (not just babbling)?",
        12,
        False,
        False,
        valid_brackets=("12mo", "15mo"),
        bracket_assignment_unconfirmed=True,  # first-word onset spans 10–14mo
    ),
    # CM05: typical_age=14mo — 15mo bracket (13.5–16.5mo). Has motor component.
    # *** CLINICAL REVIEW REQUIRED *** — proto-declarative pointing emerges 12–15mo.
    Item(
        "CM05",
        "communication",
        "How many times in the past week has your child pointed at something to show you it, without being asked?",
        14,
        True,
        True,
        valid_brackets=("12mo", "15mo"),
        bracket_assignment_unconfirmed=True,  # pointing onset ranges 12–15mo
    ),  # pointing has a motor component
    # CM06: typical_age=24mo — 24mo bracket (22.5–25.5mo).
    Item(
        "CM06",
        "communication",
        "How many times in the past week has your child put two or more words together (e.g. 'more milk')?",
        24,
        False,
        False,
        valid_brackets=("21mo", "24mo", "27mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # --- Cognitive (6) ---
    #
    # CG01: typical_age=8mo — 9mo bracket (7.5–10.5mo). Object permanence.
    Item(
        "CG01",
        "cognitive",
        "How many times in the past week has your child looked for a toy after watching it get hidden?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG02: typical_age=10mo — in 9mo bracket (7.5–10.5mo). Motor confound.
    Item(
        "CG02",
        "cognitive",
        "How many times in the past week has your child imitated a simple action you did (e.g. clapping)?",
        10,
        True,
        True,
        valid_brackets=("9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG03: typical_age=16mo — 15mo bracket (13.5–16.5mo). Motor confound.
    Item(
        "CG03",
        "cognitive",
        "How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)?",
        16,
        True,
        True,
        valid_brackets=("15mo", "18mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG04: typical_age=18mo — 18mo bracket (16.5–19.5mo).
    Item(
        "CG04",
        "cognitive",
        "How many times in the past week has your child pointed to a named body part when asked?",
        18,
        False,
        True,
        valid_brackets=("18mo", "21mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG05: typical_age=30mo — 30mo bracket (28.5–31.5mo). Motor confound.
    Item(
        "CG05",
        "cognitive",
        "How many times in the past week has your child sorted objects by shape or color?",
        30,
        True,
        True,
        valid_brackets=("27mo", "30mo", "33mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG06: typical_age=36mo — 36mo bracket (34.5–39mo). Motor confound.
    # *** CLINICAL REVIEW REQUIRED *** — 36mo is on the 36mo/42mo group boundary.
    Item(
        "CG06",
        "cognitive",
        "How many times in the past week has your child completed a simple 3-4 piece puzzle?",
        36,
        True,
        True,
        valid_brackets=("33mo", "36mo", "42mo"),
        bracket_assignment_unconfirmed=True,  # 36mo is on the 24–36/36–60 group boundary
    ),
    # --- Personal-social (6) ---
    #
    # PS01: typical_age=2mo — social smile, well established in 2mo bracket.
    Item(
        "PS01",
        "personal_social",
        "How many times in the past week has your child smiled back at you or another familiar person?",
        2,
        False,
        False,
        valid_brackets=("2mo", "4mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS02: typical_age=4mo — 4mo bracket.
    Item(
        "PS02",
        "personal_social",
        "How many times in the past week has your child laughed out loud during play?",
        4,
        False,
        False,
        valid_brackets=("4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS03: typical_age=8mo — 9mo bracket.
    Item(
        "PS03",
        "personal_social",
        "How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS04: typical_age=14mo — 15mo bracket. Near 12mo boundary.
    # *** CLINICAL REVIEW REQUIRED *** — showing/sharing behavior emerges 12–15mo.
    Item(
        "PS04",
        "personal_social",
        "How many times in the past week has your child shown a favorite toy or object to you?",
        14,
        False,
        False,
        valid_brackets=("12mo", "15mo"),
        bracket_assignment_unconfirmed=True,  # showing behavior onset ranges 12–15mo
    ),
    # PS05: typical_age=24mo — 24mo bracket.
    Item(
        "PS05",
        "personal_social",
        "How many times in the past week has your child played alongside (not necessarily with) other children?",
        24,
        False,
        False,
        valid_brackets=("21mo", "24mo", "27mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS06: typical_age=36mo — 36mo bracket. On group boundary.
    # *** CLINICAL REVIEW REQUIRED *** — turn-taking consolidates 33–42mo.
    Item(
        "PS06",
        "personal_social",
        "How many times in the past week has your child taken turns or shared a toy with another child?",
        36,
        False,
        False,
        valid_brackets=("33mo", "36mo", "42mo"),
        bracket_assignment_unconfirmed=True,  # turn-taking onset spans 33–42mo
    ),
    # --- Self-help / adaptive (6) ---
    #
    # SH01: typical_age=6mo — 6mo bracket (5–7.5mo).
    Item(
        "SH01",
        "self_help",
        "How many times in the past week has your child brought their hand or an object to their mouth to feed themselves?",
        6,
        False,
        False,
        valid_brackets=("4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH02: typical_age=9mo — 9mo bracket (7.5–10.5mo). Motor confound.
    Item(
        "SH02",
        "self_help",
        "How many times in the past week has your child held their own bottle or cup?",
        9,
        True,
        True,
        valid_brackets=("9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH03: typical_age=10mo — 9mo bracket (7.5–10.5mo) upper end.
    Item(
        "SH03",
        "self_help",
        "How many times in the past week has your child fed themselves with fingers?",
        10,
        False,
        False,
        valid_brackets=("9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH04: typical_age=15mo — 15mo bracket (13.5–16.5mo). Motor confound.
    Item(
        "SH04",
        "self_help",
        "How many times in the past week has your child tried to use a spoon by themselves, even messily?",
        15,
        True,
        True,
        valid_brackets=("12mo", "15mo", "18mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH05: typical_age=18mo — 18mo bracket (16.5–19.5mo).
    Item(
        "SH05",
        "self_help",
        "How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed?",
        18,
        False,
        False,
        valid_brackets=("15mo", "18mo", "21mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH06: typical_age=28mo — 27mo bracket (25.5–28.5mo) upper end.
    # *** CLINICAL REVIEW REQUIRED *** — toilet awareness ranges 24–36mo broadly.
    Item(
        "SH06",
        "self_help",
        "How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet?",
        28,
        False,
        False,
        valid_brackets=("27mo", "30mo"),
        bracket_assignment_unconfirmed=True,  # toilet awareness spans 24–36mo broadly
    ),
]

assert len(ITEM_BANK) == 36, f"expected 36 items, got {len(ITEM_BANK)}"
assert {i.domain for i in ITEM_BANK} == set(DOMAINS)
for d in DOMAINS:
    n = sum(1 for i in ITEM_BANK if i.domain == d)
    assert n == 6, f"domain {d} has {n} items, expected 6"

# Validate bracket assignments at import time
for _item in ITEM_BANK:
    assert _item.valid_brackets, (
        f"Item {_item.item_id} has empty valid_brackets — every item must be "
        "explicitly assigned to at least one bracket."
    )

# Surface all items requiring clinical review — useful in CI output
UNCONFIRMED_ITEMS: list[str] = [
    item.item_id for item in ITEM_BANK if item.bracket_assignment_unconfirmed
]
# 10 items flagged for clinical review (near bracket boundaries)
# GM04, GM05, FM01, FM02, FM04, CM04, CM05, CG06, PS04, PS06, SH06
assert len(UNCONFIRMED_ITEMS) > 0, (
    "Expected at least some items flagged for clinical review — check item definitions."
)
