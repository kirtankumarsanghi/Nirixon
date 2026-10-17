"""Live Elicitation task catalog and helpers for Module A (0-60 months).

Provides concrete, real-time observational activities for caregivers or clinicians
to administer directly with the child during a check-in.

Each task links directly to a milestone item in the Stage 1 item bank.
An answer recorded through a LiveTaskCard feeds the exact same item
that the adaptive engine would otherwise assess retrospectively by recall,
tagged with source="observed".
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class LiveTaskOption:
    label: str
    value: int
    description: str


@dataclass(frozen=True)
class LiveTaskDefinition:
    task_id: str
    milestone_item_id: str
    domain: str
    age_bracket: str
    title: str
    instruction: str
    what_to_observe: str
    response_options: tuple[LiveTaskOption, LiveTaskOption, LiveTaskOption]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["response_options"] = [asdict(opt) for opt in self.response_options]
        return d


STANDARD_OPTIONS: tuple[LiveTaskOption, LiveTaskOption, LiveTaskOption] = (
    LiveTaskOption(
        label="Observed clearly (2-3+ times)",
        value=2,
        description="Child performs the behavior promptly and independently without struggle.",
    ),
    LiveTaskOption(
        label="Emerging / partial (1 time)",
        value=1,
        description="Child makes an intentional attempt or succeeds with encouragement / assistance.",
    ),
    LiveTaskOption(
        label="Not yet observed",
        value=0,
        description="Child did not attempt or could not perform the behavior during this check-in.",
    ),
)


LIVE_TASKS: list[LiveTaskDefinition] = [
    # 2-4 months
    LiveTaskDefinition(
        task_id="live_GM01_head_lift",
        milestone_item_id="GM01",
        domain="gross_motor",
        age_bracket="2mo",
        title="Tummy Time Head Lift",
        instruction="Place your baby gently on their tummy on a firm, comfortable surface. Get down at eye level in front of them and shake a colorful toy or gently call their name.",
        what_to_observe="Observe whether baby lifts their head at least 45 degrees off the floor and holds it steady for 5 seconds.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CM01_vocalize",
        milestone_item_id="CM01",
        domain="communication",
        age_bracket="2mo",
        title="Coos & Vocal Response",
        instruction="Hold your baby 8–12 inches from your face. Speak warmly in a sing-song voice ('hello sweetheart, look at you!'), then pause quietly and smile warmly.",
        what_to_observe="Observe if baby makes open vowel vocal sounds (like 'ooh', 'aah') in response to your voice.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_PS01_social_smile",
        milestone_item_id="PS01",
        domain="personal_social",
        age_bracket="2mo",
        title="Responsive Social Smile",
        instruction="Look directly into your baby's eyes, smile widely, and nod gently without tickling.",
        what_to_observe="Watch if your baby smiles responsively back at you (not just gas or random reflex).",
        response_options=STANDARD_OPTIONS,
    ),

    # 4-6 months
    LiveTaskDefinition(
        task_id="live_GM02_roll_tummy",
        milestone_item_id="GM02",
        domain="gross_motor",
        age_bracket="4mo",
        title="Rolling Over",
        instruction="Place baby on their back on a mat. Hold a favorite toy slightly to one side, just out of arm's reach.",
        what_to_observe="Observe if baby twists their hips and rolls themselves onto their tummy or back.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_FM01_hands_together",
        milestone_item_id="FM01",
        domain="fine_motor",
        age_bracket="4mo",
        title="Midline Hands Contact",
        instruction="Lie baby on back or sit supported in your lap. Offer a soft ring toy directly above chest level.",
        what_to_observe="Observe if baby brings both hands together in the center to touch or clasp fingers.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CG01_tracks_toy",
        milestone_item_id="CG01",
        domain="cognitive",
        age_bracket="4mo",
        title="Visual Tracking 180°",
        instruction="Hold a high-contrast toy about 10 inches from baby's eyes until they fixate. Slowly sweep it from far left to far right in a smooth arc.",
        what_to_observe="Observe whether baby follows the toy with smooth head and eye movements all the way across.",
        response_options=STANDARD_OPTIONS,
    ),

    # 6-9 months
    LiveTaskDefinition(
        task_id="live_GM03_sit_support",
        milestone_item_id="GM03",
        domain="gross_motor",
        age_bracket="6mo",
        title="Independent Sitting Balance",
        instruction="Sit baby on a playmat with feet out in front. Provide initial support at the waist, then slowly release your hands while staying right beside them.",
        what_to_observe="Observe if baby maintains balance sitting unsupported without tipping over for at least 15 seconds.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_FM02_reach_grasp",
        milestone_item_id="FM02",
        domain="fine_motor",
        age_bracket="6mo",
        title="Reaching & Rattle Grasp",
        instruction="Present a small rattle or teething ring about 6 inches in front of baby's chest.",
        what_to_observe="Observe if baby reaches out intentionally with one or both hands and grasps the toy using whole hand.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CM02_babbles",
        milestone_item_id="CM02",
        domain="communication",
        age_bracket="6mo",
        title="Consonant Babbling Play",
        instruction="Engage your child face-to-face with playful repetition of sounds like 'ba-ba', 'da-da', 'ma-ma'.",
        what_to_observe="Listen if your child repeats string of consonant syllables ('ba-ba', 'ga-ga', 'da-da').",
        response_options=STANDARD_OPTIONS,
    ),

    # 9-12 months
    LiveTaskDefinition(
        task_id="live_GM04_pull_to_stand",
        milestone_item_id="GM04",
        domain="gross_motor",
        age_bracket="9mo",
        title="Pull-to-Stand on Furniture",
        instruction="Place baby sitting near a sturdy coffee table or sofa with a toy on top.",
        what_to_observe="Observe if baby places hands on the surface and pulls their body up into a standing position on their feet.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_FM03_pincer_grasp",
        milestone_item_id="FM03",
        domain="fine_motor",
        age_bracket="9mo",
        title="Pincer Grasp (Crumb / Cheerio)",
        instruction="Place a single cheerio, puff, or clean small button on a highchair tray within easy reach.",
        what_to_observe="Observe whether baby uses the thumb and index fingertip (pincer grasp) rather than raking with the whole palm.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CG03_peekaboo",
        milestone_item_id="CG03",
        domain="cognitive",
        age_bracket="9mo",
        title="Object Permanence / Peek-a-Boo",
        instruction="Show child a bright toy, then hide it completely beneath a small washcloth right in front of them.",
        what_to_observe="Observe if child reaches and lifts the washcloth to retrieve the hidden toy.",
        response_options=STANDARD_OPTIONS,
    ),

    # 12-18 months
    LiveTaskDefinition(
        task_id="live_GM05_independent_steps",
        milestone_item_id="GM05",
        domain="gross_motor",
        age_bracket="12mo",
        title="Independent Steps",
        instruction="Stand 3 to 4 paces away with open arms and invite your child forward with an encouraging smile.",
        what_to_observe="Observe if child takes 3 or more independent steps forward without holding onto walls or your hands.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_FM04_drop_in_cup",
        milestone_item_id="FM04",
        domain="fine_motor",
        age_bracket="12mo",
        title="Drop Block into Cup",
        instruction="Give child a small wooden block and place an open plastic cup in front of them. Model dropping a block into the cup once.",
        what_to_observe="Observe if child voluntarily releases the block into the cup.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_SH02_finger_feed",
        milestone_item_id="SH02",
        domain="self_help",
        age_bracket="12mo",
        title="Self-Feeding Finger Food",
        instruction="Place small, safe bite-sized snacks on the child's tray.",
        what_to_observe="Observe whether child independently picks up food and brings it accurately to their mouth to eat.",
        response_options=STANDARD_OPTIONS,
    ),

    # 18-24 months
    LiveTaskDefinition(
        task_id="live_FM05_stack_blocks",
        milestone_item_id="FM05",
        domain="fine_motor",
        age_bracket="18mo",
        title="Stacking 2-3 Blocks",
        instruction="Place 4 small wooden blocks on the table. Stack two blocks and say: 'Your turn, build a tower!'",
        what_to_observe="Observe if child balances at least 2 or 3 blocks on top of each other without them immediately tumbling.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CG04_scribble",
        milestone_item_id="CG04",
        domain="cognitive",
        age_bracket="18mo",
        title="Spontaneous Crayon Marks",
        instruction="Give child a thick, non-toxic crayon and a sheet of plain paper. Encourage them to draw.",
        what_to_observe="Observe if child holds the crayon and intentionally makes marks, dots, or back-and-forth scribbles on paper.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_GM06_kick_ball",
        milestone_item_id="GM06",
        domain="gross_motor",
        age_bracket="24mo",
        title="Kicking a Large Ball",
        instruction="Place an 8-inch lightweight ball on the floor 2 feet in front of your child. Say 'Kick the ball to me!'",
        what_to_observe="Observe if child kicks the ball forward with one foot without falling down or holding onto furniture.",
        response_options=STANDARD_OPTIONS,
    ),

    # 24-36 months
    LiveTaskDefinition(
        task_id="live_FM06_tower_six",
        milestone_item_id="FM06",
        domain="fine_motor",
        age_bracket="24mo",
        title="Tower of 6 Blocks",
        instruction="Give child 8 small blocks. Demonstrate stacking a tall tower, then invite them to build their own.",
        what_to_observe="Observe if child successfully stacks 6 or more blocks on top of one another.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_CM05_two_word_combo",
        milestone_item_id="CM05",
        domain="communication",
        age_bracket="24mo",
        title="Two-Word Phrase Combination",
        instruction="While playing with toys or looking at a picture book, ask questions like 'What is the puppy doing?' or 'What do you want?'",
        what_to_observe="Listen if child spontaneously joins two words together with distinct meanings (e.g., 'big ball', 'want juice', 'car go').",
        response_options=STANDARD_OPTIONS,
    ),

    # 36-60 months
    LiveTaskDefinition(
        task_id="live_CG05_shape_sorting",
        milestone_item_id="CG05",
        domain="cognitive",
        age_bracket="36mo",
        title="Shape Matching (Circle & Square)",
        instruction="Draw a circle and a square on paper, or use a 2-shape puzzle board. Hand the child circle and square cutouts and ask: 'Put the shape where it belongs.'",
        what_to_observe="Observe if child places both shapes into their matching outlines correctly.",
        response_options=STANDARD_OPTIONS,
    ),
    LiveTaskDefinition(
        task_id="live_PS04_takes_turns",
        milestone_item_id="PS04",
        domain="personal_social",
        age_bracket="36mo",
        title="Turn-Taking Rolling Ball",
        instruction="Sit on the floor with legs spread facing your child. Roll a ball to them and say 'My turn, now roll it back!'",
        what_to_observe="Observe whether child waits, receives the ball, and willingly rolls or passes it back for at least two exchanges.",
        response_options=STANDARD_OPTIONS,
    ),
]


def get_all_live_tasks() -> list[LiveTaskDefinition]:
    return list(LIVE_TASKS)


def get_tasks_for_bracket(bracket: str) -> list[LiveTaskDefinition]:
    """Retrieve tasks matching an age bracket or applicable adjacent bracket."""
    b_clean = bracket.strip().lower()
    matches = [t for t in LIVE_TASKS if t.age_bracket.lower() == b_clean]
    if matches:
        return matches

    # Bracket fallback mapping if exact bracket string differs
    # (e.g. "6-12m" vs "6mo")
    return [
        t for t in LIVE_TASKS
        if any(token in b_clean for token in (t.age_bracket.lower(), t.domain.lower()))
    ] or list(LIVE_TASKS[:4])


def get_task_by_id(task_id: str) -> LiveTaskDefinition | None:
    for t in LIVE_TASKS:
        if t.task_id == task_id:
            return t
    return None


def get_task_for_item(item_id: str) -> LiveTaskDefinition | None:
    for t in LIVE_TASKS:
        if t.milestone_item_id == item_id:
            return t
    return None
