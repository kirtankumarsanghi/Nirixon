import { AGE_BRACKET_CASES } from "./trainingCasesByAge";
export type TrainingTier = "Typical" | "Monitor" | "Refer";

export interface TrainingCase {
  id: string;
  title: string;
  age: string;
  module: "A" | "B";
  /** Age bracket (Module A) or age band (Module B) the milestone is drawn from. */
  bracket?: string;
  vignette: string;
  signals: string[];
  answer: TrainingTier;
  rationale: string;
  safetyRule?: string;
}

export const BASE_TRAINING_CASES: TrainingCase[] = [
  {
    id: "case-18m-communication",
    title: "No words at 18 months",
    age: "18 months",
    module: "A",
    vignette:
      "A mother says her son has never said a word, does not point at things, and only sometimes turns when she calls his name. He walks well and feeds himself.",
    signals: ["No words at 18m", "No pointing", "Name response inconsistent"],
    answer: "Refer",
    rationale:
      "No words plus no pointing and inconsistent name response are social-communication red flags at 18 months. Refer to a paediatrician or DEIC; do not wait for the next routine visit.",
    safetyRule: "Social-communication red flags override a typical motor score.",
  },
  {
    id: "case-24m-typical",
    title: "On track at 2 years",
    age: "24 months",
    module: "A",
    vignette:
      "A child walks, runs, says about 20 words, follows simple instructions, stacks four blocks and has not lost any skill. The caregiver has three storybooks at home.",
    signals: ["20 words", "Follows instructions", "No regression"],
    answer: "Typical",
    rationale:
      "Skills are in line with age across the checked areas and there is no regression. Give positive reinforcement and the home activities; re-screen in about 3 months.",
  },
  {
    id: "case-36m-motor",
    title: "Falls and cannot jump",
    age: "36 months",
    module: "A",
    vignette:
      "A 3-year-old speaks clearly and plays with other children, but cannot jump with both feet, trips often, and cannot climb the two steps at the Anganwadi without help.",
    signals: ["Cannot jump at 3y", "Frequent falls", "Climbing difficulty"],
    answer: "Monitor",
    rationale:
      "Isolated gross-motor lag with intact communication and social skills sits in the Monitor band. Offer practice activities, check for a motor confound, and re-screen in 4 weeks; refer if it persists or worsens.",
  },
  {
    id: "case-8y-attention-vision",
    title: "Cannot sit still and squints",
    age: "8 years",
    module: "B",
    vignette:
      "A teacher says the child cannot sit still, is falling behind in reading, and holds the book very close. The child also complains of headaches after copying from the board.",
    signals: ["Attention concern", "Reading behind", "Holds book close", "Headaches"],
    answer: "Refer",
    rationale:
      "Attention and reading concerns co-occur with a positive vision rule-out (squinting, holding print close, headaches). Refer for vision screening first; the academic picture cannot be interpreted until vision is checked.",
    safetyRule: "A positive vision/hearing rule-out always forces referral.",
  },
  {
    id: "case-10y-safety",
    title: "“I want to disappear”",
    age: "10 years",
    module: "B",
    vignette:
      "While answering the school-age questions, a caregiver reports that the child has said “I want to disappear” and has stopped playing with friends.",
    signals: ["Self-harm language", "Social withdrawal"],
    answer: "Refer",
    rationale:
      "Self-harm language triggers the immediate safety path regardless of the domain scores: show the helplines (Tele-MANAS 14416, Kiran, CHILDLINE 1098, 112), stay with the family, and arrange same-day clinical support.",
    safetyRule: "Safety language is never averaged away or delayed.",
  },
];

function ageInMonths(age: string): number {
  const value = parseFloat(age);
  return /year/i.test(age) ? value * 12 : value;
}

/** Module A first, then Module B; youngest to oldest within each module (stable for ties). */
export const TRAINING_CASES: TrainingCase[] = [...BASE_TRAINING_CASES, ...AGE_BRACKET_CASES].sort(
  (a, b) => a.module.localeCompare(b.module) || ageInMonths(a.age) - ageInMonths(b.age),
);

export interface TrainingQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  rationale: string;
}

export const TRAINING_QUIZ: TrainingQuestion[] = [
  {
    id: "q-regression",
    question: "A caregiver says the child has stopped saying words they used to say. What is the correct first action?",
    options: ["Wait three months and re-screen", "Refer immediately (Tier 3)", "Score the communication domain as typical", "Ask only about motor milestones"],
    answer: 1,
    rationale: "Any loss of a previously mastered skill triggers the deterministic safety floor and an immediate referral.",
  },
  {
    id: "q-module-b-floor",
    question: "What is the minimum number of real Module B answers before the engine may stop early?",
    options: ["3", "5", "8", "20"],
    answer: 2,
    rationale: "Module B requires at least 8 real answers and at least 3 covered domains before stopping.",
  },
  {
    id: "q-vision",
    question: "A Module B vision/hearing rule-out is positive. What happens to the result?",
    options: ["It is averaged with the other domains", "It is ignored unless attention is also low", "It forces a Tier 3 referral", "It becomes a Monitor result"],
    answer: 2,
    rationale: "Positive rule-outs are deterministic: they force referral and are never diluted by domain scores.",
  },
  {
    id: "q-prematurity",
    question: "When should corrected age be used instead of chronological age?",
    options: ["For every child under 5", "For infants under 24 months born before 37 weeks", "Only for Module B", "Only after a referral"],
    answer: 1,
    rationale: "Prematurity correction applies to infants under 24 months born before 37 weeks, using the 40-week due date.",
  },
  {
    id: "q-referral-order",
    question: "Which is the correct referral lifecycle order?",
    options: ["created → seen → sent → outcome recorded → closed", "created → sent → seen → outcome recorded → closed", "sent → created → closed → seen", "created → closed → seen"],
    answer: 1,
    rationale: "Outcomes cannot be recorded until the child has been marked as seen at the facility.",
  },
  {
    id: "q-privacy",
    question: "Which set of fields may be shared in a minimal referral summary?",
    options: ["Name, phone, address, birthdate", "Age bracket, tier, domains of concern, safety rule", "Full free-text intake and home address", "Child name and caregiver phone"],
    answer: 1,
    rationale: "The handoff standard is strictly four non-identifying fields; names, phones and addresses stay out of referral summaries.",
  },
  {
    id: "q-epds",
    question: "A caregiver answers “sometimes” to EPDS item 10 (thoughts of self-harm). What should you do?",
    options: ["Wait for the total score", "Ignore it if the total is below 10", "Show helplines immediately and arrange same-day support", "Score it as zero because it is only sometimes"],
    answer: 2,
    rationale: "Any positive response on the self-harm item triggers the urgent path regardless of the total score.",
  },
  {
    id: "q-overdue",
    question: "A child's follow-up is overdue. What is the most appropriate frontline action?",
    options: ["Delete the record", "Contact the caregiver and reschedule the visit", "Mark the referral closed", "Wait for the supervisor to call"],
    answer: 1,
    rationale: "Contact the household, record the contact, and set the next follow-up date; the caseload dashboard highlights overdue visits.",
  },
  {
    id: "q-screening",
    question: "What does a screening result mean?",
    options: ["A confirmed medical diagnosis", "A triage signal that needs clinical correlation", "A permanent label for the child", "A replacement for a paediatric assessment"],
    answer: 1,
    rationale: "Nirixon is a screening and triage tool; every tier needs clinical correlation and never replaces a full assessment.",
  },
  {
    id: "q-screen-time",
    question: "Which response best uses the new parent-context questions?",
    options: ["Use them to diagnose ADHD", "Ignore them because they are unscored", "Use them to guide the conversation and flag follow-up areas", "Add them to the child's domain scores"],
    answer: 2,
    rationale: "Context answers (screen time, home learning environment, prematurity) shape the conversation and follow-up plan; they are not a diagnosis.",
  },
];

const EXTRA_QUIZ: TrainingQuestion[] = [
  {
    id: "q-milestone-2mo",
    question: "Which set of milestones is expected in the 2-month bracket?",
    options: ["Walks alone and says two words", "Lifts head on tummy, coos and smiles back", "Stacks blocks and runs", "Takes turns with other children"],
    answer: 1,
    rationale: "Head lift (GM01), cooing (CM01) and social smiling (PS01) are the earliest Module A items, typical around 2 months.",
  },
  {
    id: "q-milestone-babble",
    question: "A 12-month-old does not babble with repeated syllables and has no clear word. How should this be read?",
    options: ["Normal variation, wait until 24 months", "A communication red flag that needs referral", "Only a motor concern", "Not relevant before 18 months"],
    answer: 1,
    rationale: "Babbling is expected by about 8 months and meaningful words by about 12 months, so their absence is a communication red flag.",
  },
  {
    id: "q-milestone-walk",
    question: "A 15-month-old cruises but has not walked alone; language, pointing and social skills are typical. What is the best tier?",
    options: ["Refer immediately", "Monitor and re-screen in 4 weeks", "Typical, no action", "Treat as regression"],
    answer: 1,
    rationale: "Independent walking is expected around 14 months, but an isolated gross-motor lag with other areas intact is a Monitor result.",
  },
  {
    id: "q-multilingual",
    question: "How should a multilingual home be handled in scoring?",
    options: ["Lower the expected language milestones", "Treat it as context, never a penalty", "Delay the screening until the child speaks one language", "Add extra risk points"],
    answer: 1,
    rationale: "Multilingual home is recorded as context and must not change domain scores or delay referral.",
  },
  {
    id: "q-motor-confound",
    question: "Why are items such as stacking blocks and using a spoon flagged as motor-confound items?",
    options: ["They are not important", "A motor difficulty alone can lower the score in another domain", "They are only for older children", "They are always scored double"],
    answer: 1,
    rationale: "Items needing hand control can score low because of motor lag rather than cognitive or self-help lag, so interpret them with the motor domain.",
  },
  {
    id: "q-module-switch",
    question: "Which age range uses the Module B school-age questions?",
    options: ["0 to 24 months", "2 to 5 years", "5 to 12 years (bands 5-7, 8-10, 11-12)", "Any age after referral"],
    answer: 2,
    rationale: "Module A covers 0-60 months in 17 brackets; Module B covers school-age children in the 5-7, 8-10 and 11-12 bands.",
  },
  {
    id: "q-brackets",
    question: "How many age brackets does Module A use, and why are they closer together in the first year?",
    options: ["5 brackets, to keep it simple", "17 brackets, because development changes fastest in the first year", "12 brackets, one per month", "3 brackets, one per year"],
    answer: 1,
    rationale: "Module A uses 17 ASQ-3-style brackets (2, 4, 6, 9, 12 months and so on), denser early because change is fastest then.",
  },
  {
    id: "q-hearing-voice",
    question: "A 4-month-old rolls and laughs but never turns toward voices. What is the right next step?",
    options: ["Ignore it because motor is typical", "Arrange a hearing evaluation", "Wait for the 12-month visit", "Score communication as typical"],
    answer: 1,
    rationale: "Failure to respond to voices and sounds is a possible hearing concern and needs evaluation regardless of other domains.",
  },
  {
    id: "q-bullying",
    question: "A 9-year-old refuses school and says classmates tease him. What should the worker do?",
    options: ["Tell the child to ignore it", "Open the bullying-support path, talk with the family and arrange follow-up", "Record nothing", "Mark the screening as typical"],
    answer: 1,
    rationale: "Bullying signals trigger a support and safeguarding path, not only a domain score.",
  },
  {
    id: "q-attention-crosssetting",
    question: "Which pattern most supports an attention-related referral in a school-age child?",
    options: ["Distracted only during one boring class", "Frequent, long-standing difficulty across home and school, affecting work, with vision/hearing normal", "A single bad week after moving house", "Being very quiet"],
    answer: 1,
    rationale: "Attention concerns need to be frequent, cross-setting, long-standing and impairing, with rule-outs checked first.",
  },
];

/** Rotate options so the correct answer is not always in the same slot. */
function rotateOptions(q: TrainingQuestion, index: number): TrainingQuestion {
  const shift = (index * 3 + 1) % q.options.length;
  const options = q.options.map((_, i) => q.options[(i - shift + q.options.length) % q.options.length]);
  return { ...q, options, answer: (q.answer + shift) % q.options.length };
}

TRAINING_QUIZ.push(...EXTRA_QUIZ.map(rotateOptions));


