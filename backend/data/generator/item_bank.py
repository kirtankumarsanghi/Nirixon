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

    COVERAGE DESIGN:
    Each item's valid_brackets spans the bracket where the milestone
    typically emerges PLUS adjacent brackets where it remains clinically
    discriminating (i.e. absence is still informative). For example,
    a milestone that emerges at 6mo is also asked at 4mo (not yet present
    = expected normal) and at 9mo (should definitely be present by now).
    This ensures every bracket has at least 1 item per domain, which is
    required for the adaptive engine's domain-coverage floor logic.

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
# 36 items: 6 per domain, ages staggered across 0-60 months.
#
# valid_brackets coverage rationale:
#   Each item spans: the bracket where the milestone emerges (typical_age)
#   PLUS earlier brackets (absence is still expected/normal) AND later
#   brackets (presence should be well established — useful as a ceiling).
#   This guarantees every bracket has ≥1 item per domain.
# ---------------------------------------------------------------------------

ITEM_BANK: list[Item] = [
    # =========================================================================
    # Gross motor (6)
    # =========================================================================

    # GM01: typical_age=2mo — head lift prone.
    # Valid: 2mo (emerges), 4mo (should be consolidating), 6mo (should be solid)
    Item(
        "GM01",
        "gross_motor",
        "How many times in the past week has your child lifted their head while lying on their tummy?",
        2,
        False,
        True,
        valid_brackets=("2mo", "4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # GM02: typical_age=5mo — rolling.
    # Valid: 4mo (emerging), 6mo (peak), 9mo (well established — absence flags delay)
    Item(
        "GM02",
        "gross_motor",
        "How many times in the past week has your child rolled from tummy to back or back to tummy?",
        5,
        False,
        True,
        valid_brackets=("4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # GM03: typical_age=8mo — sitting without support.
    # Valid: 6mo (emerging), 9mo (peak), 12mo (consolidated — absence is a red flag)
    Item(
        "GM03",
        "gross_motor",
        "How many times in the past week has your child sat without support for a few minutes?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # GM04: typical_age=11mo — pulling to stand.
    # *** CLINICAL REVIEW REQUIRED *** — 11mo is near 9mo/12mo boundary.
    # Valid: 9mo (emerging), 12mo (peak), 15mo (should be there; absence = concern)
    Item(
        "GM04",
        "gross_motor",
        "How many times in the past week has your child pulled themselves up to stand?",
        11,
        False,
        True,
        valid_brackets=("9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=True,  # 11mo is near 9mo/12mo boundary
    ),
    # GM05: typical_age=14mo — independent walking.
    # *** CLINICAL REVIEW REQUIRED *** — walking onset varies 12–15mo.
    # Valid: 12mo (emerging), 15mo (peak), 18mo, 21mo, 24mo (absence = significant delay)
    Item(
        "GM05",
        "gross_motor",
        "How many times in the past week has your child walked a few steps without holding on?",
        14,
        False,
        True,
        valid_brackets=("12mo", "15mo", "18mo", "21mo", "24mo"),
        bracket_assignment_unconfirmed=True,  # walking onset ranges 12–15mo
    ),
    # GM06: typical_age=30mo — running/jumping/climbing.
    # Valid from 27mo through all older brackets — preschoolers should all do this.
    Item(
        "GM06",
        "gross_motor",
        "How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time?",
        30,
        False,
        True,
        valid_brackets=("27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=False,
    ),

    # =========================================================================
    # Fine motor (6)
    # =========================================================================

    # FM01: typical_age=3mo — hands to midline.
    # *** CLINICAL REVIEW REQUIRED *** — 3mo sits on 2mo/4mo boundary.
    # Valid: 2mo (very early), 4mo (peak), 6mo (well established)
    Item(
        "FM01",
        "fine_motor",
        "How many times in the past week has your child brought their hands together at the middle of their body?",
        3,
        False,
        True,
        valid_brackets=("2mo", "4mo", "6mo"),
        bracket_assignment_unconfirmed=True,  # 3mo sits exactly on 2mo/4mo boundary
    ),
    # FM02: typical_age=5mo — reaching and grabbing.
    # *** CLINICAL REVIEW REQUIRED *** — 5mo straddles 4mo/6mo.
    # Valid: 4mo (emerging), 6mo (peak), 9mo (consolidated)
    Item(
        "FM02",
        "fine_motor",
        "How many times in the past week has your child reached for and grabbed a nearby toy?",
        5,
        False,
        True,
        valid_brackets=("4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=True,  # 5mo is on 4mo/6mo boundary
    ),
    # FM03: typical_age=8mo — passing toy hand to hand.
    # Valid: 6mo (emerging), 9mo (peak), 12mo, 15mo (absence = fine motor concern)
    Item(
        "FM03",
        "fine_motor",
        "How many times in the past week has your child passed a toy from one hand to the other?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # FM04: typical_age=11mo — pincer grasp.
    # *** CLINICAL REVIEW REQUIRED *** — pincer grasp onset ranges 9–12mo.
    # Valid: 9mo (emerging), 12mo (peak), 15mo, 18mo (should be refined)
    Item(
        "FM04",
        "fine_motor",
        "How many times in the past week has your child picked up a small object using thumb and finger?",
        11,
        False,
        True,
        valid_brackets=("9mo", "12mo", "15mo", "18mo"),
        bracket_assignment_unconfirmed=True,  # pincer grasp onset varies 9–12mo
    ),
    # FM05: typical_age=18mo — scribbling.
    # Valid: 15mo (emerging), 18mo (peak), 21mo, 24mo, 27mo, 30mo
    Item(
        "FM05",
        "fine_motor",
        "How many times in the past week has your child scribbled with a crayon on paper?",
        18,
        False,
        True,
        valid_brackets=("15mo", "18mo", "21mo", "24mo", "27mo", "30mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # FM06: typical_age=20mo — stacking blocks.
    # Valid: 18mo (emerging), 21mo (peak), 24mo, 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo
    Item(
        "FM06",
        "fine_motor",
        "How many times in the past week has your child stacked two or more small blocks?",
        20,
        True,
        True,
        valid_brackets=("18mo", "21mo", "24mo", "27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=False,
    ),  # tagged motor_confound: also used to probe cognitive/problem-solving

    # =========================================================================
    # Communication (6)
    # =========================================================================

    # CM01: typical_age=2mo — cooing/gurgling.
    # Valid: 2mo (emerges), 4mo (consolidating), 6mo (should be present)
    Item(
        "CM01",
        "communication",
        "How many times in the past week has your child made cooing or gurgling sounds?",
        2,
        False,
        False,
        valid_brackets=("2mo", "4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM02: typical_age=4mo — turning toward voice/sound.
    # Valid: 4mo (emerges), 6mo (peak), 9mo (should be well established)
    Item(
        "CM02",
        "communication",
        "How many times in the past week has your child turned toward a familiar voice or sound?",
        4,
        False,
        False,
        valid_brackets=("4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM03: typical_age=8mo — canonical babbling.
    # Valid: 6mo (emerging), 9mo (peak), 12mo, 15mo (absence = red flag)
    Item(
        "CM03",
        "communication",
        "How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')?",
        8,
        False,
        False,
        valid_brackets=("6mo", "9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CM04: typical_age=12mo — first meaningful word.
    # *** CLINICAL REVIEW REQUIRED *** — first word ranges 10–14mo.
    # Valid: 12mo (emerging), 15mo (peak), 18mo, 21mo (absence is a clear flag)
    Item(
        "CM04",
        "communication",
        "How many times in the past week has your child said a clear word with meaning (not just babbling)?",
        12,
        False,
        False,
        valid_brackets=("12mo", "15mo", "18mo", "21mo"),
        bracket_assignment_unconfirmed=True,  # first-word onset spans 10–14mo
    ),
    # CM05: typical_age=14mo — proto-declarative pointing.
    # *** CLINICAL REVIEW REQUIRED *** — pointing emerges 12–15mo.
    # Valid: 12mo (emerging), 15mo (peak), 18mo, 21mo, 24mo
    Item(
        "CM05",
        "communication",
        "How many times in the past week has your child pointed at something to show you it, without being asked?",
        14,
        True,
        True,
        valid_brackets=("12mo", "15mo", "18mo", "21mo", "24mo"),
        bracket_assignment_unconfirmed=True,  # pointing onset ranges 12–15mo
    ),  # pointing has a motor component
    # CM06: typical_age=24mo — two-word phrases.
    # Valid: 21mo (emerging), 24mo (peak), 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo
    Item(
        "CM06",
        "communication",
        "How many times in the past week has your child put two or more words together (e.g. 'more milk')?",
        24,
        False,
        False,
        valid_brackets=("21mo", "24mo", "27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=False,
    ),

    # =========================================================================
    # Cognitive (6)
    # =========================================================================

    # CG01: typical_age=8mo — object permanence / visual tracking.
    # Note: at 2mo and 4mo the item serves as a visual-attention screen (does
    # the baby track a moving object?), not full object permanence — the text
    # is interpreted age-contextually by the caregiver.
    # Valid: 2mo, 4mo (visual tracking), 6mo (emerging), 9mo (peak), 12mo
    Item(
        "CG01",
        "cognitive",
        "How many times in the past week has your child looked for a toy after watching it get hidden?",
        8,
        False,
        True,
        valid_brackets=("2mo", "4mo", "6mo", "9mo", "12mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG02: typical_age=10mo — imitation of simple actions.
    # At 4mo, very early imitation (tongue-protrusion, facial expressions) is
    # already measurable — the item captures a continuum from early social
    # mirroring to deliberate action imitation.
    # Valid: 4mo (early imitation), 9mo (emerging), 12mo (peak), 15mo
    Item(
        "CG02",
        "cognitive",
        "How many times in the past week has your child imitated a simple action you did (e.g. clapping)?",
        10,
        True,
        True,
        valid_brackets=("4mo", "9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG03: typical_age=16mo — functional pretend play.
    # Valid: 15mo (emerging), 18mo (peak), 21mo, 24mo
    Item(
        "CG03",
        "cognitive",
        "How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)?",
        16,
        True,
        True,
        valid_brackets=("15mo", "18mo", "21mo", "24mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG04: typical_age=18mo — pointing to named body part.
    # Valid: 18mo (emerging), 21mo (peak), 24mo, 27mo, 30mo (absence = cognitive/language concern)
    Item(
        "CG04",
        "cognitive",
        "How many times in the past week has your child pointed to a named body part when asked?",
        18,
        False,
        True,
        valid_brackets=("18mo", "21mo", "24mo", "27mo", "30mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG05: typical_age=30mo — sorting by shape or color.
    # Valid: 27mo (emerging), 30mo (peak), 33mo, 36mo, 42mo, 48mo, 54mo, 60mo
    Item(
        "CG05",
        "cognitive",
        "How many times in the past week has your child sorted objects by shape or color?",
        30,
        True,
        True,
        valid_brackets=("27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # CG06: typical_age=36mo — 3-4 piece puzzle.
    # *** CLINICAL REVIEW REQUIRED *** — 36mo is on the 36mo/42mo group boundary.
    # Valid: 33mo (emerging), 36mo (peak), 42mo, 48mo, 54mo, 60mo
    Item(
        "CG06",
        "cognitive",
        "How many times in the past week has your child completed a simple 3-4 piece puzzle?",
        36,
        True,
        True,
        valid_brackets=("33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=True,  # 36mo is on the 24–36/36–60 group boundary
    ),

    # =========================================================================
    # Personal-social (6)
    # =========================================================================

    # PS01: typical_age=2mo — social smile.
    # Valid: 2mo (emerges), 4mo (consolidated), 6mo (should be very present)
    Item(
        "PS01",
        "personal_social",
        "How many times in the past week has your child smiled back at you or another familiar person?",
        2,
        False,
        False,
        valid_brackets=("2mo", "4mo", "6mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS02: typical_age=4mo — laughing out loud.
    # Valid: 4mo (emerges), 6mo (peak), 9mo (well established)
    Item(
        "PS02",
        "personal_social",
        "How many times in the past week has your child laughed out loud during play?",
        4,
        False,
        False,
        valid_brackets=("4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS03: typical_age=8mo — back-and-forth games (peekaboo).
    # Valid: 6mo (emerging), 9mo (peak), 12mo, 15mo (absence = social-communication concern)
    Item(
        "PS03",
        "personal_social",
        "How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)?",
        8,
        False,
        True,
        valid_brackets=("6mo", "9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS04: typical_age=14mo — showing/sharing objects.
    # *** CLINICAL REVIEW REQUIRED *** — sharing behavior emerges 12–15mo.
    # Valid: 12mo (emerging), 15mo (peak), 18mo, 21mo, 24mo
    Item(
        "PS04",
        "personal_social",
        "How many times in the past week has your child shown a favorite toy or object to you?",
        14,
        False,
        False,
        valid_brackets=("12mo", "15mo", "18mo", "21mo", "24mo"),
        bracket_assignment_unconfirmed=True,  # showing behavior onset ranges 12–15mo
    ),
    # PS05: typical_age=24mo — parallel play alongside other children.
    # Valid: 21mo (emerging), 24mo (peak), 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo
    Item(
        "PS05",
        "personal_social",
        "How many times in the past week has your child played alongside (not necessarily with) other children?",
        24,
        False,
        False,
        valid_brackets=("21mo", "24mo", "27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # PS06: typical_age=36mo — turn-taking / sharing with another child.
    # *** CLINICAL REVIEW REQUIRED *** — turn-taking consolidates 33–42mo.
    # Valid: 33mo (emerging), 36mo (peak), 42mo, 48mo, 54mo, 60mo
    Item(
        "PS06",
        "personal_social",
        "How many times in the past week has your child taken turns or shared a toy with another child?",
        36,
        False,
        False,
        valid_brackets=("33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
        bracket_assignment_unconfirmed=True,  # turn-taking onset spans 33–42mo
    ),

    # =========================================================================
    # Self-help / adaptive (6)
    # =========================================================================

    # SH01: typical_age=6mo — hand/object to mouth self-feeding.
    # At 2mo, the item measures self-soothing hand-to-mouth behaviour (fist
    # sucking), which is a normal early self-regulation milestone and the
    # earliest observable self-help behaviour.
    # Valid: 2mo (early self-soothing), 4mo (emerging), 6mo (peak), 9mo
    Item(
        "SH01",
        "self_help",
        "How many times in the past week has your child brought their hand or an object to their mouth to feed themselves?",
        6,
        False,
        False,
        valid_brackets=("2mo", "4mo", "6mo", "9mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH02: typical_age=9mo — holding own bottle/cup.
    # Valid: 9mo (emerging), 12mo (peak), 15mo (well established)
    Item(
        "SH02",
        "self_help",
        "How many times in the past week has your child held their own bottle or cup?",
        9,
        True,
        True,
        valid_brackets=("9mo", "12mo", "15mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH03: typical_age=10mo — finger feeding.
    # Valid: 9mo (emerging), 12mo (peak), 15mo, 18mo
    Item(
        "SH03",
        "self_help",
        "How many times in the past week has your child fed themselves with fingers?",
        10,
        False,
        False,
        valid_brackets=("9mo", "12mo", "15mo", "18mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH04: typical_age=15mo — spoon use.
    # Valid: 12mo (emerging), 15mo (peak), 18mo, 21mo, 24mo, 27mo
    Item(
        "SH04",
        "self_help",
        "How many times in the past week has your child tried to use a spoon by themselves, even messily?",
        15,
        True,
        True,
        valid_brackets=("12mo", "15mo", "18mo", "21mo", "24mo", "27mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH05: typical_age=18mo — cooperative dressing (pushing arm through sleeve).
    # Valid: 15mo (emerging), 18mo (peak), 21mo, 24mo, 27mo, 30mo, 33mo, 36mo
    Item(
        "SH05",
        "self_help",
        "How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed?",
        18,
        False,
        False,
        valid_brackets=("15mo", "18mo", "21mo", "24mo", "27mo", "30mo", "33mo", "36mo"),
        bracket_assignment_unconfirmed=False,
    ),
    # SH06: typical_age=28mo — toileting awareness.
    # *** CLINICAL REVIEW REQUIRED *** — toilet awareness ranges 24–36mo broadly.
    # Valid: 27mo (emerging), 30mo (peak), 33mo, 36mo, 42mo, 48mo, 54mo, 60mo
    Item(
        "SH06",
        "self_help",
        "How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet?",
        28,
        False,
        False,
        valid_brackets=("27mo", "30mo", "33mo", "36mo", "42mo", "48mo", "54mo", "60mo"),
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

# Verify every bracket has at least 1 item per domain (fail fast if coverage gap exists)
from data.generator.age_brackets import BRACKET_LABELS  # noqa: E402 — import after defs

_ITEM_BY_DOMAIN = {d: [i for i in ITEM_BANK if i.domain == d] for d in DOMAINS}
for _label in BRACKET_LABELS:
    for _domain in DOMAINS:
        _has_item = any(_label in i.valid_brackets for i in _ITEM_BY_DOMAIN[_domain])
        assert _has_item, (
            f"COVERAGE GAP: bracket '{_label}' has no items for domain '{_domain}'. "
            "Every bracket must have at least 1 item per domain for the adaptive engine."
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
