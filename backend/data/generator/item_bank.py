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

DOMAINS are intentionally the 6 standard developmental screening
domains used by instruments like the ASQ-3, so the item bank reads as
recognizable rather than invented.
"""

from dataclasses import dataclass

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


# ---------------------------------------------------------------------------
# 36 items: 6 per domain, ages staggered across 0-60 months so difficulty is
# realistically spread out rather than clustered at one age.
# ---------------------------------------------------------------------------

ITEM_BANK: list[Item] = [
    # --- Gross motor (6) ---
    Item(
        "GM01",
        "gross_motor",
        "How many times in the past week has your child lifted their head while lying on their tummy?",
        2,
        False,
        True,
    ),
    Item(
        "GM02",
        "gross_motor",
        "How many times in the past week has your child rolled from tummy to back or back to tummy?",
        5,
        False,
        True,
    ),
    Item(
        "GM03",
        "gross_motor",
        "How many times in the past week has your child sat without support for a few minutes?",
        8,
        False,
        True,
    ),
    Item(
        "GM04",
        "gross_motor",
        "How many times in the past week has your child pulled themselves up to stand?",
        11,
        False,
        True,
    ),
    Item(
        "GM05",
        "gross_motor",
        "How many times in the past week has your child walked a few steps without holding on?",
        14,
        False,
        True,
    ),
    Item(
        "GM06",
        "gross_motor",
        "How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time?",
        30,
        False,
        True,
    ),
    # --- Fine motor (6) ---
    Item(
        "FM01",
        "fine_motor",
        "How many times in the past week has your child brought their hands together at the middle of their body?",
        3,
        False,
        True,
    ),
    Item(
        "FM02",
        "fine_motor",
        "How many times in the past week has your child reached for and grabbed a nearby toy?",
        5,
        False,
        True,
    ),
    Item(
        "FM03",
        "fine_motor",
        "How many times in the past week has your child passed a toy from one hand to the other?",
        8,
        False,
        True,
    ),
    Item(
        "FM04",
        "fine_motor",
        "How many times in the past week has your child picked up a small object using thumb and finger?",
        11,
        False,
        True,
    ),
    Item(
        "FM05",
        "fine_motor",
        "How many times in the past week has your child scribbled with a crayon on paper?",
        18,
        False,
        True,
    ),
    Item(
        "FM06",
        "fine_motor",
        "How many times in the past week has your child stacked two or more small blocks?",
        20,
        True,
        True,
    ),  # tagged motor_confound: also used to probe cognitive/problem-solving
    # --- Communication (6) ---
    Item(
        "CM01",
        "communication",
        "How many times in the past week has your child made cooing or gurgling sounds?",
        2,
        False,
        False,
    ),
    Item(
        "CM02",
        "communication",
        "How many times in the past week has your child turned toward a familiar voice or sound?",
        4,
        False,
        False,
    ),
    Item(
        "CM03",
        "communication",
        "How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')?",
        8,
        False,
        False,
    ),
    Item(
        "CM04",
        "communication",
        "How many times in the past week has your child said a clear word with meaning (not just babbling)?",
        12,
        False,
        False,
    ),
    Item(
        "CM05",
        "communication",
        "How many times in the past week has your child pointed at something to show you it, without being asked?",
        14,
        True,
        True,
    ),  # pointing has a motor component
    Item(
        "CM06",
        "communication",
        "How many times in the past week has your child put two or more words together (e.g. 'more milk')?",
        24,
        False,
        False,
    ),
    # --- Cognitive (6) ---
    Item(
        "CG01",
        "cognitive",
        "How many times in the past week has your child looked for a toy after watching it get hidden?",
        8,
        False,
        True,
    ),
    Item(
        "CG02",
        "cognitive",
        "How many times in the past week has your child imitated a simple action you did (e.g. clapping)?",
        10,
        True,
        True,
    ),
    Item(
        "CG03",
        "cognitive",
        "How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)?",
        16,
        True,
        True,
    ),
    Item(
        "CG04",
        "cognitive",
        "How many times in the past week has your child pointed to a named body part when asked?",
        18,
        False,
        True,
    ),
    Item(
        "CG05",
        "cognitive",
        "How many times in the past week has your child sorted objects by shape or color?",
        30,
        True,
        True,
    ),
    Item(
        "CG06",
        "cognitive",
        "How many times in the past week has your child completed a simple 3-4 piece puzzle?",
        36,
        True,
        True,
    ),
    # --- Personal-social (6) ---
    Item(
        "PS01",
        "personal_social",
        "How many times in the past week has your child smiled back at you or another familiar person?",
        2,
        False,
        False,
    ),
    Item(
        "PS02",
        "personal_social",
        "How many times in the past week has your child laughed out loud during play?",
        4,
        False,
        False,
    ),
    Item(
        "PS03",
        "personal_social",
        "How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)?",
        8,
        False,
        True,
    ),
    Item(
        "PS04",
        "personal_social",
        "How many times in the past week has your child shown a favorite toy or object to you?",
        14,
        False,
        False,
    ),
    Item(
        "PS05",
        "personal_social",
        "How many times in the past week has your child played alongside (not necessarily with) other children?",
        24,
        False,
        False,
    ),
    Item(
        "PS06",
        "personal_social",
        "How many times in the past week has your child taken turns or shared a toy with another child?",
        36,
        False,
        False,
    ),
    # --- Self-help / adaptive (6) ---
    Item(
        "SH01",
        "self_help",
        "How many times in the past week has your child brought their hand or an object to their mouth to feed themselves?",
        6,
        False,
        False,
    ),
    Item(
        "SH02",
        "self_help",
        "How many times in the past week has your child held their own bottle or cup?",
        9,
        True,
        True,
    ),
    Item(
        "SH03",
        "self_help",
        "How many times in the past week has your child fed themselves with fingers?",
        10,
        False,
        False,
    ),
    Item(
        "SH04",
        "self_help",
        "How many times in the past week has your child tried to use a spoon by themselves, even messily?",
        15,
        True,
        True,
    ),
    Item(
        "SH05",
        "self_help",
        "How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed?",
        18,
        False,
        False,
    ),
    Item(
        "SH06",
        "self_help",
        "How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet?",
        28,
        False,
        False,
    ),
]

assert len(ITEM_BANK) == 36, f"expected 36 items, got {len(ITEM_BANK)}"
assert {i.domain for i in ITEM_BANK} == set(DOMAINS)
for d in DOMAINS:
    n = sum(1 for i in ITEM_BANK if i.domain == d)
    assert n == 6, f"domain {d} has {n} items, expected 6"
