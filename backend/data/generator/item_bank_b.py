"""
Module B — School-Age Item Bank (ages 5–12 / 60–144 months)

Defines ~60 items across 8 functioning domains plus a separate rule-out list
for vision/hearing/global-delay triage.

Key differences from Module A's item_bank.py:
  - Uses SchoolItem(Item) subclass that adds `screening_tier` and replaces
    `valid_brackets` usage (unused in Module B — filtering is by domain, not
    age bracket). valid_brackets is kept for dataclass compatibility but holds
    the screening tier string for introspection.
  - Domains are functioning areas, not developmental milestones; items are
    adapted from Vanderbilt, INDT-ADHD, DALI/NIMHANS SLD, NIMHANS written-
    expression, SDQ, DCDQ, and RBSK 4D tools.
  - Response scale: 0 = Never / 1 = Sometimes (1-2x/week) / 2 = Often (3+/week)
    for most items; SDQ items use 0 = Not true / 1 = Somewhat true / 2 = Certainly
    true — same 3-point scale, consistent with Module A encoding.
  - RULE_OUT_ITEMS are never scored Typical/Monitor/Refer; they trigger a
    specialist-referral message when any answer is positive (value = 2).

CLINICAL REVIEW REQUIRED:
  All items are informed by published instruments but are NOT direct reproductions.
  Items must be reviewed by a licensed child-development specialist, educational
  psychologist, and/or paediatrician before any clinical or near-clinical use.
  See ROADMAP.md for the clinical sign-off gate.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from data.generator.item_bank import Item

# ---------------------------------------------------------------------------
# Module B domain registry
# ---------------------------------------------------------------------------

MODULE_B_DOMAINS = [
    "attention",          # Deep: Vanderbilt/INDT-ADHD-aligned
    "reading",            # Deep: DALI/NIMHANS SLD reading
    "writing",            # Deep: NIMHANS SLD written-expression
    "numbers",            # Deep: NIMHANS SLD + NCERT numeracy
    "listening_speaking", # Broad: listening comprehension & verbal expression
    "motor",              # Broad: DCDQ motor coordination
    "social",             # Broad: social participation
    "emotion_conduct",    # Broad: SDQ subscales (emotional + conduct combined)
]

MODULE_B_DEEP_DOMAINS = {"attention", "reading", "writing", "numbers"}
MODULE_B_BROAD_DOMAINS = {"listening_speaking", "motor", "social", "emotion_conduct"}


@dataclass(frozen=True)
class SchoolItem(Item):
    """
    Extends Item with a screening_tier field.
    valid_brackets is repurposed to hold (screening_tier,) for compatibility
    with shared adaptive-tree code that iterates valid_brackets.
    At runtime, Module B's adaptive tree dispatches on domain, not brackets.
    """
    screening_tier: Literal["deep", "broad", "rule_out"] = "deep"


# ---------------------------------------------------------------------------
# Attention & work habits — 8 items (Vanderbilt/INDT-ADHD-aligned)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_ATTENTION_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "AT01", "attention",
        "How often does the child have difficulty staying focused on schoolwork or tasks that require sustained effort?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT02", "attention",
        "How often does the child make careless mistakes in schoolwork or miss details?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT03", "attention",
        "How often does the child seem not to listen when spoken to directly?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT04", "attention",
        "How often does the child fail to finish schoolwork, chores, or tasks before moving on to something else?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT05", "attention",
        "How often does the child have trouble organising tasks, activities, or belongings?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT06", "attention",
        "How often does the child fidget, tap hands or feet, or squirm in the seat?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT07", "attention",
        "How often does the child leave their seat in situations where staying seated is expected?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "AT08", "attention",
        "How often does the child interrupt or blurt out answers before a question is finished?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
]

# ---------------------------------------------------------------------------
# Reading — 8 items (DALI/NIMHANS SLD reading-aligned)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_READING_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "RD01", "reading",
        "How often does the child read words much more slowly than classmates of the same age?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD02", "reading",
        "How often does the child skip words, lines, or whole sentences while reading aloud?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD03", "reading",
        "How often does the child guess at words based on their first letter rather than reading the whole word?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD04", "reading",
        "How often does the child mix up similar-looking letters or words (e.g. 'b' and 'd', 'was' and 'saw')?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD05", "reading",
        "How often does the child have difficulty understanding what they have just read?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD06", "reading",
        "How often does the child avoid or refuse reading tasks at home or at school?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD07", "reading",
        "How often does the child lose their place while reading, even in short passages?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "RD08", "reading",
        "How often does the child find rhyming words or breaking words into syllables very difficult?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
]

# ---------------------------------------------------------------------------
# Writing — 7 items (NIMHANS SLD written-expression aligned)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_WRITING_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "WR01", "writing",
        "How often does the child's handwriting look much messier than other children the same age?",
        84, True, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),  # motor_confound: handwriting has a fine-motor component
    SchoolItem(
        "WR02", "writing",
        "How often does the child write letters or numbers backwards (e.g. mirror-writing)?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "WR03", "writing",
        "How often does the child have trouble expressing ideas in writing even when they can say them aloud?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "WR04", "writing",
        "How often does the child write very slowly even for short sentences?",
        84, True, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "WR05", "writing",
        "How often does the child make many spelling mistakes in words they have been taught?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "WR06", "writing",
        "How often does the child leave out words or mix up word order in written sentences?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "WR07", "writing",
        "How often does the child hold their pencil in an awkward or painful-looking grip?",
        84, True, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
]

# ---------------------------------------------------------------------------
# Numbers & reasoning — 7 items (NIMHANS SLD + NCERT numeracy aligned)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_NUMBERS_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "NM01", "numbers",
        "How often does the child make mistakes in basic addition or subtraction that classmates find easy?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM02", "numbers",
        "How often does the child find it very hard to understand what a number means or how big it is?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM03", "numbers",
        "How often does the child mix up maths signs or steps when solving a problem?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM04", "numbers",
        "How often does the child find it very difficult to count on or count back from a number?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM05", "numbers",
        "How often does the child have trouble remembering multiplication tables or number facts they have practised?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM06", "numbers",
        "How often does the child struggle to tell the time on a clock or understand money amounts?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
    SchoolItem(
        "NM07", "numbers",
        "How often does the child find word problems very confusing even when the maths itself seems within reach?",
        84, False, False,
        valid_brackets=("deep",),
        bracket_assignment_unconfirmed=True,
        screening_tier="deep",
    ),
]

# ---------------------------------------------------------------------------
# Listening & speaking — 6 items (broad surveillance)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_LISTENING_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "LS01", "listening_speaking",
        "How often does the child have difficulty following multi-step verbal instructions?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "LS02", "listening_speaking",
        "How often does the child struggle to find the right word when speaking?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "LS03", "listening_speaking",
        "How often does the child speak in sentences that are harder to understand than peers the same age?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "LS04", "listening_speaking",
        "How often does the child have trouble retelling a story or event in a clear order?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "LS05", "listening_speaking",
        "How often does the child ask you to repeat things much more than other children the same age?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "LS06", "listening_speaking",
        "How often does the child misunderstand jokes or figures of speech that other children the same age understand?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
]

# ---------------------------------------------------------------------------
# Motor & coordination — 6 items (DCDQ-aligned, broad surveillance)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_MOTOR_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "MT01", "motor",
        "How often does the child bump into things or drop objects more than other children the same age?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "MT02", "motor",
        "How often does the child find it harder than classmates to catch, kick, or throw a ball?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "MT03", "motor",
        "How often does the child tire quickly or avoid physical activities such as running or climbing?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "MT04", "motor",
        "How often does the child seem clumsy when moving around furniture, stairs, or a busy classroom?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "MT05", "motor",
        "How often does the child struggle with tasks requiring both hands together, such as cutting with scissors?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "MT06", "motor",
        "How often does the child have difficulty learning new physical skills (e.g. riding a bike, using a skipping rope)?",
        84, True, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
]

# ---------------------------------------------------------------------------
# Social participation — 6 items (SDQ peer-problems subscale aligned, broad)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_SOCIAL_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "SC01", "social",
        "How often does the child play alone rather than with other children, even when others are available?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "SC02", "social",
        "How often is the child bullied, teased, or left out by other children?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "SC03", "social",
        "How often does the child find it difficult to make or keep friends?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "SC04", "social",
        "How often does the child prefer the company of much younger or much older children rather than same-age peers?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "SC05", "social",
        "How often does the child misread social cues, such as not noticing when someone is bored or upset?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "SC06", "social",
        "How often does the child get into arguments or fights with other children?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
]

# ---------------------------------------------------------------------------
# Emotions & school adjustment — 8 items (SDQ emotional + conduct subscales
# combined into one domain per spec; broad surveillance)
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

_EMOTION_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "EM01", "emotion_conduct",
        "How often does the child complain of headaches, stomach aches, or sickness before or at school?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM02", "emotion_conduct",
        "How often does the child worry a lot or seem very anxious about everyday things?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM03", "emotion_conduct",
        "How often does the child seem unhappy, sad, or tearful?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM04", "emotion_conduct",
        "How often does the child refuse to go to school or have very strong distress at school drop-off?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM05", "emotion_conduct",
        "How often does the child have angry outbursts or very strong tantrums for their age?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM06", "emotion_conduct",
        "How often does the child deliberately annoy or provoke others?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM07", "emotion_conduct",
        "How often does the child lie, steal, or break rules in a way that seems more than occasional naughtiness?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
    SchoolItem(
        "EM08", "emotion_conduct",
        "How often does the child seem fearful in situations that other children the same age handle without distress?",
        84, False, False,
        valid_brackets=("broad",),
        bracket_assignment_unconfirmed=True,
        screening_tier="broad",
    ),
]

# ---------------------------------------------------------------------------
# Combined item bank
# ---------------------------------------------------------------------------

MODULE_B_ITEM_BANK: list[SchoolItem] = (
    _ATTENTION_ITEMS
    + _READING_ITEMS
    + _WRITING_ITEMS
    + _NUMBERS_ITEMS
    + _LISTENING_ITEMS
    + _MOTOR_ITEMS
    + _SOCIAL_ITEMS
    + _EMOTION_ITEMS
)

# ---------------------------------------------------------------------------
# Rule-out / safety triage — RBSK 4D aligned
# These items are NEVER scored Typical/Monitor/Refer.
# A value of 2 (Often) on any of these triggers a specialist-referral message.
# *** CLINICAL REVIEW REQUIRED ***
# ---------------------------------------------------------------------------

RULE_OUT_ITEMS: list[SchoolItem] = [
    SchoolItem(
        "RO01", "rule_out",
        "Does the child squint, close one eye, or hold reading material very close to their face?",
        84, False, False,
        valid_brackets=("rule_out",),
        bracket_assignment_unconfirmed=True,
        screening_tier="rule_out",
    ),
    SchoolItem(
        "RO02", "rule_out",
        "Does the child frequently ask 'what?' or seem to mishear things in quiet settings?",
        84, False, False,
        valid_brackets=("rule_out",),
        bracket_assignment_unconfirmed=True,
        screening_tier="rule_out",
    ),
    SchoolItem(
        "RO03", "rule_out",
        "Does the child seem far behind peers in most areas — not just one — in a way that concerns you deeply?",
        84, False, False,
        valid_brackets=("rule_out",),
        bracket_assignment_unconfirmed=True,
        screening_tier="rule_out",
    ),
    SchoolItem(
        "RO04", "rule_out",
        "Does the child show strong preference for rigid routines, very limited interests, or unusual sensory reactions "
        "that seem significantly different from other children the same age?",
        84, False, False,
        valid_brackets=("rule_out",),
        bracket_assignment_unconfirmed=True,
        screening_tier="rule_out",
    ),
]

# ---------------------------------------------------------------------------
# Sanity checks (fail fast at import time)
# ---------------------------------------------------------------------------

assert len(MODULE_B_ITEM_BANK) == 56, (
    f"Expected 56 Module B items, got {len(MODULE_B_ITEM_BANK)}"
)
assert {i.domain for i in MODULE_B_ITEM_BANK} == set(MODULE_B_DOMAINS), (
    "Module B item domains do not match MODULE_B_DOMAINS"
)
for _d in MODULE_B_DOMAINS:
    _n = sum(1 for i in MODULE_B_ITEM_BANK if i.domain == _d)
    assert _n >= 6, f"Module B domain '{_d}' has only {_n} items (minimum 6)"

MODULE_B_ITEM_BY_ID: dict[str, SchoolItem] = {
    item.item_id: item for item in MODULE_B_ITEM_BANK + RULE_OUT_ITEMS
}
MODULE_B_ITEMS_BY_DOMAIN: dict[str, list[SchoolItem]] = {
    d: [item for item in MODULE_B_ITEM_BANK if item.domain == d]
    for d in MODULE_B_DOMAINS
}
