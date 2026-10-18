import type { Domain } from "./model";

export type Lang = "en" | "hi";
export type Module = "A" | "B";

interface Q {
  en: string;
  hi: string;
}

type Bank = Record<Domain, { B: Q; A: Q }>;

export const MODULES: Record<Module, { label: string; age: string; min: number; max: number; subtitle: string; note: string }> = {
  A: {
    label: "Early years",
    age: "1–59 months",
    min: 1,
    max: 59,
    subtitle: "Play-based milestones across six developmental areas.",
    note: "Questions adapt to an early-years pathway for children under five.",
  },
  B: {
    label: "School age",
    age: "60–144 months",
    min: 60,
    max: 144,
    subtitle: "Home and school functioning, learning, peers and self-help.",
    note: "Questions follow a school-age pathway for children from five to twelve.",
  },
};

export const moduleForAge = (months: number): Module => (months >= 60 ? "B" : "A");

export const SCHOOL_ACTIVITIES: Record<Domain, string> = {
  gross: "Choose a short movement circuit — balance, hop, change direction and throw a ball — and let the child track their own progress.",
  fine: "Try a five-minute practical task: write a short note, cut along a line, or organise coins and small classroom items.",
  comm: "Ask the child to retell a familiar event in order, then follow a two- or three-step instruction together.",
  social: "Plan a turn-taking game with a sibling or friend, then talk about what helped when someone disagreed.",
  cog: "Use a simple recipe, timetable or puzzle that needs three steps; let the child explain their plan before starting.",
  adaptive: "Make a school-morning checklist and let the child pack their bag, dress and check off each step independently.",
};

/** Target item B is asked first; a lower answer opens the easier follow-up item A. */
export const QUESTION_BANK: Record<Module, Bank> = {
  A: {
    gross: {
      B: { en: "Ask your child to jump with both feet off the ground at the same time.", hi: "अपने बच्चे से कहें कि वह दोनों पैरों से एक साथ ज़मीन से उछले।" },
      A: { en: "Ask your child to walk up a few steps holding your hand or the rail.", hi: "बच्चे को आपका हाथ या रेलिंग पकड़कर कुछ सीढ़ियाँ चढ़ने को कहें।" },
    },
    fine: {
      B: { en: "Give your child a crayon and draw a straight line. Do they copy it?", hi: "बच्चे को क्रेयॉन दें और एक सीधी रेखा खींचें। क्या वह उसकी नकल करता/करती है?" },
      A: { en: "Does your child stack 3–4 blocks into a small tower?", hi: "क्या आपका बच्चा 3–4 ब्लॉक एक के ऊपर एक रखकर छोटी मीनार बना लेता/लेती है?" },
    },
    comm: {
      B: { en: "Does your child speak in sentences of three or more words, like ‘I want water’?", hi: "क्या आपका बच्चा 3 या अधिक शब्दों के वाक्य बोलता/बोलती है, जैसे ‘मुझे पानी चाहिए’?" },
      A: { en: "Does your child say at least 20 words that you can understand?", hi: "क्या आपका बच्चा कम से कम 20 ऐसे शब्द बोलता/बोलती है जो आप समझ सकें?" },
    },
    social: {
      B: { en: "Does your child play beside other children and wait for a turn?", hi: "क्या आपका बच्चा दूसरे बच्चों के पास बैठकर खेलता/खेलती है और अपनी बारी का इंतज़ार करता/करती है?" },
      A: { en: "Does your child show you things or point to share what interests them?", hi: "क्या आपका बच्चा अपनी पसंद की चीज़ें दिखाता/दिखाती या उंगली से इशारा करता/करती है?" },
    },
    cog: {
      B: { en: "Ask your child to sort toys by colour, or match two identical shapes.", hi: "बच्चे से खिलौनों को रंग के अनुसार अलग करने या एक जैसे आकार मिलाने को कहें।" },
      A: { en: "Does your child pretend — feeding a doll, or talking on a toy phone?", hi: "क्या आपका बच्चा नकल वाला खेल खेलता/खेलती है — जैसे गुड़िया को खिलाना या खिलौना फ़ोन पर बात करना?" },
    },
    adaptive: {
      B: { en: "Does your child put on a loose T-shirt or pull on pants with little help?", hi: "क्या आपका बच्चा ढीली टी-शर्ट या पैंट थोड़ी मदद से पहन लेता/लेती है?" },
      A: { en: "Does your child feed themselves with a spoon, spilling very little?", hi: "क्या आपका बच्चा चम्मच से खुद खा लेता/लेती है, बहुत कम गिराते हुए?" },
    },
  },
  B: {
    gross: {
      B: { en: "Can the child run, change direction and stop without regularly losing balance?", hi: "क्या बच्चा दौड़ते हुए दिशा बदल और रुक सकता/सकती है, बिना बार-बार संतुलन खोए?" },
      A: { en: "Can the child climb stairs and take part in ordinary school games with peers?", hi: "क्या बच्चा सीढ़ियाँ चढ़ सकता/सकती है और साथियों के साथ सामान्य स्कूल खेलों में भाग लेता/लेती है?" },
    },
    fine: {
      B: { en: "Can the child write, draw or use classroom tools without unusual difficulty or fatigue?", hi: "क्या बच्चा बिना असामान्य कठिनाई या थकान के लिख, चित्र बना या कक्षा के औज़ार इस्तेमाल कर सकता/सकती है?" },
      A: { en: "Can the child fasten buttons, open containers and handle small objects independently?", hi: "क्या बच्चा बटन लगा, डिब्बे खोल और छोटी चीज़ें स्वतंत्र रूप से संभाल सकता/सकती है?" },
    },
    comm: {
      B: { en: "Can the child explain an event in order and understand multi-step spoken instructions?", hi: "क्या बच्चा किसी घटना को क्रम से बता और कई चरणों वाले बोले गए निर्देश समझ सकता/सकती है?" },
      A: { en: "Can unfamiliar adults usually understand the child’s speech and responses?", hi: "क्या अपरिचित वयस्क आमतौर पर बच्चे की बात और उत्तर समझ पाते हैं?" },
    },
    social: {
      B: { en: "Does the child make and keep friendships, take turns and recover after small disagreements?", hi: "क्या बच्चा दोस्त बना और निभा, बारी ले और छोटी असहमति के बाद सामान्य हो सकता/सकती है?" },
      A: { en: "Does the child join group activities without usually withdrawing or becoming overwhelmed?", hi: "क्या बच्चा समूह गतिविधियों में शामिल होता/होती है, बिना अक्सर अलग होने या बहुत परेशान हुए?" },
    },
    cog: {
      B: { en: "Can the child learn a new classroom task, remember it and use it again the next day?", hi: "क्या बच्चा कक्षा का नया काम सीख, याद रख और अगले दिन फिर इस्तेमाल कर सकता/सकती है?" },
      A: { en: "Can the child solve age-appropriate problems and complete a task with a few steps?", hi: "क्या बच्चा उम्र के अनुसार समस्या हल और कुछ चरणों वाला काम पूरा कर सकता/सकती है?" },
    },
    adaptive: {
      B: { en: "Can the child manage dressing, eating, toileting and school belongings for their age?", hi: "क्या बच्चा उम्र के अनुसार कपड़े, खाना, शौच और स्कूल का सामान संभाल सकता/सकती है?" },
      A: { en: "Can the child follow a familiar daily routine with only occasional reminders?", hi: "क्या बच्चा कभी-कभार याद दिलाने पर परिचित दैनिक दिनचर्या पूरी कर सकता/सकती है?" },
    },
  },
};

export const ANSWERS: { val: 0 | 1 | 2; en: string; hi: string }[] = [
  { val: 2, en: "Yes, does this consistently", hi: "हाँ, लगातार करता/करती है" },
  { val: 1, en: "Sometimes or with help", hi: "कभी-कभी या मदद से" },
  { val: 0, en: "Not yet / significant difficulty", hi: "अभी नहीं / काफी कठिनाई" },
];

export const REGRESSION_Q: Q = {
  en: "Has the child stopped doing something they used to do?",
  hi: "क्या बच्चे ने कोई ऐसा काम करना बंद कर दिया है जो पहले करता/करती था?",
};

export const UI: Record<Lang, Record<string, string>> = {
  en: { question: "Question", tag: "TRY OR DISCUSS THIS TOGETHER · 30 SEC", back: "Back", complete: "complete" },
  hi: { question: "प्रश्न", tag: "अभी साथ मिलकर करके देखें · 30 सेकंड", back: "वापस", complete: "पूरा" },
};

export function domainScore(b: 0 | 1 | 2, a?: 0 | 1 | 2): number {
  if (b === 2) return 0.4;
  const aa = a ?? 1;
  if (aa === 2) return b === 1 ? -0.7 : -1.1;
  if (aa === 1) return b === 1 ? -1.3 : -1.6;
  return -2.5;
}