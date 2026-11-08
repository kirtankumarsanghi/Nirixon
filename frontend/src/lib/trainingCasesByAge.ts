import type { TrainingCase } from "./trainingContent";

/**
 * Practice cases built from the Module A item bank (36 milestone items, 17 ASQ-3-style
 * age brackets) and the Module B question bank (age bands 5-7, 8-10, 11-12).
 * Each case is anchored to the milestones the bank expects at that age.
 * All vignettes are synthetic.
 */

const CLINICAL_NOTE =
  " Screening is triage, not diagnosis; it needs clinical correlation.";

export const MODULE_A_AGE_CASES: TrainingCase[] = [
  {
    id: "case-a-2mo-typical",
    title: "Cooing and smiling",
    age: "2 months",
    module: "A",
    bracket: "2mo",
    vignette:
      "A mother reports that her baby lifts her head briefly on her tummy, makes cooing sounds, smiles back at family and brings a hand to her mouth every day.",
    signals: ["Lifts head (GM01)", "Cooing (CM01)", "Social smile (PS01)"],
    answer: "Typical",
    rationale:
      "Head lift, cooing and social smiling are the expected 2-month milestones and all are seen several times a week. Praise the caregiver, encourage face-to-face talk and tummy time, and re-screen at the next bracket.",
  },
  {
    id: "case-a-4mo-no-turn",
    title: "Does not turn to voices",
    age: "4 months",
    module: "A",
    bracket: "4mo",
    vignette:
      "A baby rolls over, grabs a nearby toy and laughs during play, but his mother says he never turns toward her voice or a clap, and he startles only at very loud noises.",
    signals: ["No turn to voice (CM02)", "Rolls over (GM02)", "Laughs (PS02)"],
    answer: "Refer",
    rationale:
      "Motor and social skills are on track but there is no response to familiar voices or sounds, which is a possible hearing concern. Arrange hearing evaluation through RBSK or DEIC; do not wait for the next visit." + CLINICAL_NOTE,
    safetyRule: "Hearing concerns are never averaged away by good motor scores.",
  },
  {
    id: "case-a-6mo-sitting",
    title: "Not sitting yet",
    age: "6 months",
    module: "A",
    bracket: "6mo",
    vignette:
      "A baby babbles, passes toys between hands and smiles during peekaboo. She rolls over but cannot sit even with a short period of support, and sometimes stiffens when lifted.",
    signals: ["Sitting not yet (GM03)", "Passes toy (FM03)", "Babbling (CM03)"],
    answer: "Monitor",
    rationale:
      "Isolated gross-motor lag with intact communication, fine-motor and social skills sits in the Monitor band. Show supported-sitting play, check for a physical confound, and re-screen in 4 weeks; refer if it persists or the stiffness continues.",
  },
  {
    id: "case-a-9mo-typical",
    title: "Pulling up and finger-feeding",
    age: "9 months",
    module: "A",
    bracket: "9mo",
    vignette:
      "A baby sits alone, pulls himself up to stand, picks up small crumbs with thumb and finger, feeds himself biscuits and plays peekaboo with enthusiasm.",
    signals: ["Pulls to stand (GM04)", "Pincer grasp (FM04)", "Finger feeding (SH03)"],
    answer: "Typical",
    rationale:
      "Skills match the 9-month milestones in motor, self-help and social areas with no regression. Give positive feedback, keep the home activities going, and re-screen at the next bracket.",
  },
  {
    id: "case-a-12mo-no-babble",
    title: "Silent at one year",
    age: "12 months",
    module: "A",
    bracket: "12mo",
    vignette:
      "A one-year-old pulls up and cruises around furniture, but he does not babble with repeated syllables, has no clear word, and does not look when his name is called.",
    signals: ["No babbling (CM03)", "No words (CM04)", "Name response weak"],
    answer: "Refer",
    rationale:
      "At 12 months, absent babbling and no meaningful words together with a weak name response are communication red flags. Refer to a paediatrician or DEIC for hearing and developmental assessment." + CLINICAL_NOTE,
    safetyRule: "Social-communication red flags override a typical motor score.",
  },
  {
    id: "case-a-15mo-late-walk",
    title: "Not walking independently",
    age: "15 months",
    module: "A",
    bracket: "15mo",
    vignette:
      "A toddler says two words, points at things she wants, feeds herself with fingers and plays peekaboo. She cruises along furniture but has not yet taken steps without holding on.",
    signals: ["No independent steps (GM05)", "Points (CM05)", "Two words (CM04)"],
    answer: "Monitor",
    rationale:
      "Late independent walking alone, with good language, pointing and social skills, is a Monitor result. Encourage supported walking practice at home and re-screen in 4 weeks; refer if there are still no steps or other areas slip.",
  },
  {
    id: "case-a-18mo-typical",
    title: "Scribbling and pointing",
    age: "18 months",
    module: "A",
    bracket: "18mo",
    vignette:
      "A toddler walks steadily, scribbles with a crayon, points to show her mother things, says about ten words and helps push her arm through her sleeve when dressed.",
    signals: ["Scribbles (FM05)", "Points to show (CM05)", "Helps dress (SH05)"],
    answer: "Typical",
    rationale:
      "Scribbling, pointing, early words and dressing help are all expected by 18 months. Reinforce what the family is doing and re-screen in about 3 months.",
  },
  {
    id: "case-a-21mo-lost-words",
    title: "Words are disappearing",
    age: "21 months",
    module: "A",
    bracket: "21mo",
    vignette:
      "A father says his son used to say about eight words, but over the last two months he has stopped using most of them and now seems less interested in playing with others.",
    signals: ["Loss of words", "Reduced play interest", "Regression flag"],
    answer: "Refer",
    rationale:
      "Loss of a previously acquired skill is a high-weight red flag regardless of other scores. Refer immediately to a paediatrician or DEIC; do not schedule a routine re-screen." + CLINICAL_NOTE,
    safetyRule: "Regression always forces Tier 3 referral.",
  },
  {
    id: "case-a-24mo-two-words",
    title: "Few words but good gestures",
    age: "24 months",
    module: "A",
    bracket: "24mo",
    vignette:
      "A 2-year-old understands instructions, walks and runs, and plays beside other children, but only uses about five words and rarely joins two words together.",
    signals: ["Few words (CM06)", "Understands instructions", "Parallel play (PS05)"],
    answer: "Monitor",
    rationale:
      "Expressive language is behind while understanding and social play are intact. Give daily talking, reading and naming activities, check hearing, and re-screen in 4 weeks; refer if language stays flat or other skills are affected.",
  },
  {
    id: "case-a-27mo-typical",
    title: "Walks, stacks, plays beside",
    age: "27 months",
    module: "A",
    bracket: "27mo",
    vignette:
      "A child runs without falling, stacks blocks into a tower, tries to use a spoon himself, speaks short phrases and plays alongside other children.",
    signals: ["Runs (GM06)", "Stacks blocks (FM06)", "Uses spoon (SH04)"],
    answer: "Typical",
    rationale:
      "Motor, self-help and social skills are consistent with the 27-month bracket. Give positive reinforcement and home activities and re-screen in about 3 months.",
  },
  {
    id: "case-a-30mo-multi-domain",
    title: "Behind in several areas",
    age: "30 months",
    module: "A",
    bracket: "30mo",
    vignette:
      "A child does not run or jump, does not scribble, speaks only a handful of words, and does not play with or notice other children. Her mother says the family speaks two languages at home.",
    signals: ["Does not run (GM06)", "No scribbling (FM05)", "Few words (CM06)", "No peer play (PS05)"],
    answer: "Refer",
    rationale:
      "Concerns across motor, language and social domains point to a broad developmental delay. Multilingual homes are context, not a reason for lower expectations or waiting. Refer to DEIC for assessment." + CLINICAL_NOTE,
    safetyRule: "A multilingual home is context, never a penalty or a reason to delay.",
  },
  {
    id: "case-a-33mo-toilet",
    title: "Toilet signals not yet shown",
    age: "33 months",
    module: "A",
    bracket: "33mo",
    vignette:
      "A child speaks in sentences, plays with others, runs and climbs well, and sorts shapes. He does not yet tell anyone when his diaper is wet and has never used the toilet.",
    signals: ["No toilet signal (SH06)", "Speaks sentences", "Plays with peers"],
    answer: "Typical",
    rationale:
      "Toileting varies with culture and home routine, and every other domain is on track. Give gentle toilet-routine guidance and re-screen in about 3 months. This is not a sign of delay on its own.",
  },
  {
    id: "case-a-36mo-turns",
    title: "Cannot take turns",
    age: "36 months",
    module: "A",
    bracket: "36mo",
    vignette:
      "A 3-year-old talks well, completes a simple puzzle and runs and climbs, but gets very distressed when asked to share and does not take turns with other children at the Anganwadi.",
    signals: ["No turn taking (PS06)", "Puzzle done (CG05)", "Language typical"],
    answer: "Monitor",
    rationale:
      "An isolated gap in turn-taking with strong cognition and language sits in the Monitor band. Practise turn-taking games, observe peer play and re-screen in 4 weeks; refer if social difficulties widen.",
  },
  {
    id: "case-a-42mo-typical",
    title: "Puzzles and sentences",
    age: "42 months",
    module: "A",
    bracket: "42mo",
    vignette:
      "A child speaks in full sentences, completes a four-piece puzzle, shares toys, jumps with both feet and stacks blocks into a tall tower.",
    signals: ["Full sentences", "Puzzle (CG05)", "Shares (PS06)"],
    answer: "Typical",
    rationale:
      "Skills fit the 42-month bracket across language, cognition, social and motor areas. Reinforce, share home activities and re-screen at the routine interval.",
  },
  {
    id: "case-a-48mo-jump",
    title: "Cannot jump or hop",
    age: "48 months",
    module: "A",
    bracket: "48mo",
    vignette:
      "A 4-year-old is chatty, completes puzzles and plays cooperatively, but cannot jump with both feet, trips often and avoids playground climbing.",
    signals: ["Cannot jump (GM06)", "Frequent falls", "Language and social typical"],
    answer: "Monitor",
    rationale:
      "Isolated gross-motor lag with typical communication and social skills is a Monitor result. Offer practice activities, check for a motor confound, and re-screen in 4 weeks; refer if it persists.",
  },
  {
    id: "case-a-54mo-vision",
    title: "Misses blocks and puzzles",
    age: "54 months",
    module: "A",
    bracket: "54mo",
    vignette:
      "A child speaks clearly and loves playing with others, but struggles with block stacking and puzzles, holds toys very close to his face and squints in bright light.",
    signals: ["Struggles with blocks (FM06)", "Holds toys close", "Squints"],
    answer: "Monitor",
    rationale:
      "Fine-motor and cognitive items can be depressed by a motor or vision confound. Check vision first, then re-screen in 4 weeks before reading the domain scores as a true lag; refer if vision problems are found.",
  },
  {
    id: "case-a-60mo-typical",
    title: "Ready for school",
    age: "60 months",
    module: "A",
    bracket: "60mo",
    vignette:
      "A 5-year-old speaks in full sentences, completes puzzles, plays and takes turns with other children, dresses herself and runs, jumps and climbs well.",
    signals: ["Full sentences", "Cooperative play", "Self-dressing"],
    answer: "Typical",
    rationale:
      "Skills are in line with the oldest Module A bracket across all six domains. Give positive reinforcement; the child will move to Module B questions after the age cut-off.",
  },
];

export const MODULE_B_AGE_CASES: TrainingCase[] = [
  {
    id: "case-b-5-7-reading",
    title: "Struggles with letters",
    age: "6 years",
    module: "B",
    bracket: "5-7",
    vignette:
      "A first-grade teacher says the child mixes up similar letters, reads very slowly, avoids reading aloud and takes much longer than classmates to finish written work. Vision and hearing checks were normal.",
    signals: ["Letter confusion", "Slow reading", "Avoids reading aloud"],
    answer: "Monitor",
    rationale:
      "A focused reading difficulty with vision and hearing ruled out sits in the Monitor band. Suggest daily shared reading, ask the teacher for classroom support, and re-screen in 4 weeks; refer if it persists.",
  },
  {
    id: "case-b-5-7-typical",
    title: "Settling well in class",
    age: "6 years",
    module: "B",
    bracket: "5-7",
    vignette:
      "A parent reports the child begins colouring and worksheets after one reminder, makes friends, enjoys counting games and speaks clearly, and has no complaints from school.",
    signals: ["Starts tasks", "Has friends", "Counting games"],
    answer: "Typical",
    rationale:
      "Attention, social, numeracy and language answers are all in the expected range with no rule-out flags. Give positive feedback and re-screen at the routine interval.",
  },
  {
    id: "case-b-5-7-asd",
    title: "Prefers to play alone",
    age: "7 years",
    module: "B",
    bracket: "5-7",
    vignette:
      "A caregiver says the child rarely makes eye contact, repeats phrases, is upset by small changes in routine and does not join in games with other children.",
    signals: ["Little eye contact", "Repeated phrases", "Routine distress", "No peer play"],
    answer: "Refer",
    rationale:
      "The global ASD rule-out is positive, so the result is a Tier 3 referral and the attention or learning scores cannot be interpreted alone. Refer to DEIC or a paediatrician." + CLINICAL_NOTE,
    safetyRule: "A positive global rule-out always forces referral.",
  },
  {
    id: "case-b-8-10-maths",
    title: "Numbers do not stick",
    age: "9 years",
    module: "B",
    bracket: "8-10",
    vignette:
      "A parent says the child still counts on fingers for simple sums, forgets times tables, and loses marks in maths while doing fine in reading, speaking and play.",
    signals: ["Counts on fingers", "Forgets tables", "Other areas typical"],
    answer: "Monitor",
    rationale:
      "A numeracy difficulty isolated from other domains is a Monitor result. Suggest short daily practice with objects, check vision and attention, and re-screen in 4 weeks.",
  },
  {
    id: "case-b-8-10-bullying",
    title: "Refuses to go to school",
    age: "9 years",
    module: "B",
    bracket: "8-10",
    vignette:
      "A child has started complaining of stomach aches on school mornings and says classmates call him names and leave him out. He has become quiet at home.",
    signals: ["School refusal", "Teasing by peers", "Withdrawn"],
    answer: "Refer",
    rationale:
      "Bullying with school refusal and withdrawal triggers the bullying-support and safeguarding path. Speak with the family about the school, offer counselling support and arrange a follow-up with a clinician or counsellor." + CLINICAL_NOTE,
    safetyRule: "Bullying signals trigger a support path, not just a score.",
  },
  {
    id: "case-b-8-10-typical",
    title: "Active but focused",
    age: "10 years",
    module: "B",
    bracket: "8-10",
    vignette:
      "A parent says the child starts homework after a short reminder, finishes classwork, writes legibly, reads for pleasure and has a good group of friends.",
    signals: ["Finishes homework", "Legible writing", "Good peers"],
    answer: "Typical",
    rationale:
      "All Module B domain answers are in the typical range and there are no rule-out or safety flags. Reinforce the routines and re-screen at the routine interval.",
  },
  {
    id: "case-b-11-12-writing",
    title: "Handwriting is exhausting",
    age: "11 years",
    module: "B",
    bracket: "11-12",
    vignette:
      "A parent says the child writes slowly, letters are uneven, the hand tires quickly and the child avoids writing tasks, although reading and speaking are fine.",
    signals: ["Slow writing", "Uneven letters", "Hand fatigue"],
    answer: "Monitor",
    rationale:
      "Isolated writing and motor difficulty with typical reading and language is a Monitor result. Check for a motor confound, suggest practice activities and re-screen in 4 weeks.",
  },
  {
    id: "case-b-11-12-attention",
    title: "Always distracted",
    age: "12 years",
    module: "B",
    bracket: "11-12",
    vignette:
      "A parent and teacher both report the child loses things, forgets instructions, starts but does not finish work, and interrupts others. Reading, vision and hearing are fine, and the difficulties have been present since early school years.",
    signals: ["Loses things", "Unfinished work", "Interrupts", "Present across settings"],
    answer: "Refer",
    rationale:
      "Attention concerns that are frequent, cross-setting, long-standing and affecting schoolwork, with rule-outs negative, warrant a developmental referral. Refer to a paediatrician or child-development clinic; this is not a diagnosis." + CLINICAL_NOTE,
  },
  {
    id: "case-b-11-12-hearing",
    title: "Asks to repeat everything",
    age: "11 years",
    module: "B",
    bracket: "11-12",
    vignette:
      "A caregiver says the child often misses instructions, asks people to repeat themselves, turns the TV up loud and seems inattentive in class.",
    signals: ["Asks to repeat", "TV volume high", "Seems inattentive"],
    answer: "Refer",
    rationale:
      "A positive vision/hearing rule-out forces referral. The inattention cannot be interpreted until hearing is tested, so refer for an audiology check first.",
    safetyRule: "A positive vision/hearing rule-out always forces referral.",
  },
  {
    id: "case-b-11-12-safety",
    title: "“Nothing matters anymore”",
    age: "12 years",
    module: "B",
    bracket: "11-12",
    vignette:
      "A parent says the child has been saying that nothing matters, has given away favourite belongings and has stopped seeing friends.",
    signals: ["Hopeless statements", "Giving away belongings", "Social withdrawal"],
    answer: "Refer",
    rationale:
      "These are warning signs for self-harm. Use the immediate safety path regardless of domain scores: show the helplines (Tele-MANAS 14416, Kiran, CHILDLINE 1098, 112), stay with the family and arrange same-day clinical support.",
    safetyRule: "Safety language is never averaged away or delayed.",
  },
];

export const AGE_BRACKET_CASES: TrainingCase[] = [...MODULE_A_AGE_CASES, ...MODULE_B_AGE_CASES];
