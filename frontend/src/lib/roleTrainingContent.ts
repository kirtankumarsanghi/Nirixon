import type { MiniQuestion } from "../components/MiniQuiz";

/* ───────────── Supervisor ───────────── */

export interface SupervisorPlaybook {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  watch: string;
}

export const SUPERVISOR_PLAYBOOKS: SupervisorPlaybook[] = [
  {
    id: "coverage",
    title: "Read coverage by worker",
    summary: "Spot which health workers have gaps before children fall through.",
    steps: [
      "Open Team & caseload and compare screened vs. due children for each worker.",
      "Look first at overdue follow-ups, then at children never screened.",
      "Ask the worker about barriers (distance, migration, caregiver availability) before assuming poor effort.",
      "Agree a dated plan: who visits, which children, by when.",
    ],
    watch: "A worker with many Monitor children and no follow-up dates is a bigger risk than one with a low screening count.",
  },
  {
    id: "referral-loop",
    title: "Close the referral loop",
    summary: "A referral only counts when the child is seen and an outcome is recorded.",
    steps: [
      "Filter Referrals by Sent but not Seen older than 7 days.",
      "Call the worker and the family; help with transport, ID or appointment barriers.",
      "Confirm the facility marked the child as seen, then check an outcome is recorded.",
      "Only close once the outcome is recorded and a next follow-up is set.",
    ],
    watch: "Order is created → sent → seen → outcome recorded → closed. Never close a referral to clear a list.",
  },
  {
    id: "quality",
    title: "Coach, don't just audit",
    summary: "Use case reviews to build worker confidence and fix systematic errors.",
    steps: [
      "Pick 3 recent screenings per worker, including at least one Monitor and one Refer.",
      "Check the safety rules were applied: regression, positive vision/hearing rule-out, self-harm language.",
      "Check the caregiver got home activities and a re-screen date.",
      "Give one praise and one improvement point, in private, within a week.",
    ],
    watch: "Repeated Typical results for children with clear red flags suggest a training gap, not a data problem.",
  },
  {
    id: "safety",
    title: "Safety escalations",
    summary: "What to do when a worker reports a child or caregiver in crisis.",
    steps: [
      "Self-harm language: show helplines (Tele-MANAS 14416, Kiran, CHILDLINE 1098, 112) and arrange same-day support.",
      "Make sure the worker is not alone with the family; offer to join or send a clinician.",
      "Record the escalation and who responded. Do not leave it to the next review.",
      "Debrief the worker afterwards; these cases are emotionally heavy.",
    ],
    watch: "Safety language is never averaged away, delayed, or handled only by message.",
  },
  {
    id: "privacy",
    title: "Privacy and handoffs",
    summary: "Keep shared summaries minimal and consent-based.",
    steps: [
      "Referral summaries carry four fields only: age bracket, tier, domains of concern, safety rule.",
      "Names, phone numbers and addresses stay out of messages and screenshots.",
      "Share reports with the district only in aggregate.",
      "Remind workers that screening is triage, not diagnosis, when talking to families.",
    ],
    watch: "If a worker asks to forward a child's name over a group chat, stop and use the handoff sheet.",
  },
];

/* ───────────── Parent ───────────── */

export interface ParentStage {
  id: string;
  label: string;
  ages: string;
  photoKey: "motherChild" | "blocksGirl" | "girl" | "school";
  intro: string;
  look: string[];
  tryAtHome: string[];
  talk: string[];
}

export const PARENT_STAGES: ParentStage[] = [
  {
    id: "baby",
    label: "Baby",
    ages: "0–12 months",
    photoKey: "motherChild",
    intro: "Your baby learns through your face, your voice and your touch. Little and often is enough.",
    look: ["Smiles back at you", "Turns toward voices and sounds", "Lifts head, then rolls and sits", "Babbles by about 8 months"],
    tryAtHome: ["Talk and sing during feeding and bathing", "Tummy time a few minutes, several times a day", "Play peek-a-boo", "Give safe things to reach and hold"],
    talk: ["Does not respond to sounds or voices", "Does not smile by about 3 months", "Stops doing something they used to do"],
  },
  {
    id: "toddler",
    label: "Toddler",
    ages: "1–3 years",
    photoKey: "blocksGirl",
    intro: "Walking, first words and play. Children this age learn by copying you.",
    look: ["Walks alone by about 15 months", "Points to show you things", "Says a few words, then joins two words", "Follows simple instructions"],
    tryAtHome: ["Name things as you point to them", "Read a picture book together daily", "Stack blocks or cups", "Let them help with simple chores"],
    talk: ["No words by 18 months or no pointing", "Does not respond to their name", "Loses words or skills they had"],
  },
  {
    id: "preschool",
    label: "Pre-schooler",
    ages: "3–5 years",
    photoKey: "girl",
    intro: "Big imagination and big energy. Play with other children builds language and friendship.",
    look: ["Speaks in short sentences others understand", "Jumps, climbs and runs", "Plays and takes turns with children", "Draws lines and circles"],
    tryAtHome: ["Tell stories and ask “what happens next?”", "Play counting and sorting games", "Let them draw and cut with safe scissors", "Limit screens and play together"],
    talk: ["Hard to understand even for family", "Cannot jump or climb steps", "Very few play skills with other children"],
  },
  {
    id: "school",
    label: "School age",
    ages: "5–12 years",
    photoKey: "school",
    intro: "School brings new pressure. Stay curious about how your child feels, not just their marks.",
    look: ["Enjoys friends and school most days", "Learning to read and do numbers", "Can sit and focus for age-appropriate time", "Sleeps and eats well"],
    tryAtHome: ["Ten minutes of reading together", "Ask one good thing and one hard thing about the day", "Keep a regular sleep time", "Praise effort, not only results"],
    talk: ["Holds books very close or squints", "Refuses school or is bullied", "Says things like “I want to disappear”"],
  },
];

export const PARENT_TIPS = [
  { title: "Every child is different", text: "Some children are a little earlier or later. A check-in shows the overall picture, not a grade." },
  { title: "A screen is not a diagnosis", text: "Nirixon helps decide whether to keep watching or talk to a health worker." },
  { title: "You know your child best", text: "If something worries you, tell your ASHA or Anganwadi worker, even if the check-in looks fine." },
];

export const PARENT_QUIZ: MiniQuestion[] = [
  {
    id: "pq-1",
    question: "Your 2-year-old used to say words but has stopped. What should you do?",
    options: ["Wait and see for a few months", "Tell your health worker soon", "Do nothing, it is a phase", "Only watch TV together"],
    answer: 1,
    rationale: "Losing a skill the child once had is always worth talking to a health worker about promptly.",
  },
  {
    id: "pq-2",
    question: "Which activity best helps a baby's language?",
    options: ["Leaving the TV on", "Talking and singing to them", "Keeping them quiet", "Giving a phone"],
    answer: 1,
    rationale: "Babies learn language from your voice and face-to-face play.",
  },
  {
    id: "pq-3",
    question: "Your child is a little late to walk but talks, points and plays well. What is best?",
    options: ["Panic", "Practise walking games and re-check in a few weeks", "Stop all play", "Ignore forever"],
    answer: 1,
    rationale: "One area a little behind while others are fine usually means keep helping and keep watching.",
  },
  {
    id: "pq-4",
    question: "Your child says “I want to disappear”. What now?",
    options: ["Tell them to stop talking like that", "Stay with them and call Tele-MANAS 14416, CHILDLINE 1098 or 112", "Wait a week", "Post about it online"],
    answer: 1,
    rationale: "Talk of self-harm needs help straight away. Stay calm, stay close and call a helpline.",
  },
  {
    id: "pq-5",
    question: "What does a Nirixon check-in result mean?",
    options: ["A medical diagnosis", "A guide on whether to keep watching or seek help", "A permanent label", "A school mark"],
    answer: 1,
    rationale: "It is a screening guide that helps you decide next steps with a health worker.",
  },
];
