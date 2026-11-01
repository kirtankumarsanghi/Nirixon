export type Lang = "en" | "hi" | "mr" | "ta" | "te" | "bn" | "gu" | "kn";

export interface LangMeta {
  /** Short code shown in compact controls. */
  label: string;
  /** Native-script name shown in the language menu. */
  native: string;
  /** BCP-47 tag for speech synthesis. */
  speech: string;
}

/**
 * Dependency-free i18n for the workspace chrome and check-in.
 *
 * Translation state is tracked per language; anything not yet clinically
 * reviewed still ships with a visible review label in the source bank.
 */
export const LANG_META: Record<Lang, LangMeta> = {
  en: { label: "EN", native: "English", speech: "en-IN" },
  hi: { label: "हिं", native: "हिन्दी", speech: "hi-IN" },
  mr: { label: "मरा", native: "मराठी", speech: "mr-IN" },
  ta: { label: "த", native: "தமிழ்", speech: "ta-IN" },
  te: { label: "తె", native: "తెలుగు", speech: "te-IN" },
  bn: { label: "বাং", native: "বাংলা", speech: "bn-IN" },
  gu: { label: "ગુ", native: "ગુજરાતી", speech: "gu-IN" },
  kn: { label: "ಕ", native: "ಕನ್ನಡ", speech: "kn-IN" },
};

export const LANGS: { id: Lang; label: string; native: string }[] = (
  Object.keys(LANG_META) as Lang[]
).map((id) => ({ id, label: LANG_META[id].label, native: LANG_META[id].native }));

type Entry = Record<Lang, string>;

export const STRINGS = {
  "common.viewingAs": {
    en: "Viewing as",
    hi: "देख रहे हैं",
    mr: "पाहत आहात",
    ta: "பார்க்கிறீர்கள்",
    te: "చూస్తున్నారు",
    bn: "দেখছেন",
    gu: "જોઈ રહ્યા છો",
    kn: "ನೋಡುತ್ತಿದ್ದೀರಿ",
  },
  "common.language": {
    en: "Language",
    hi: "भाषा",
    mr: "भाषा",
    ta: "மொழி",
    te: "భాష",
    bn: "ভাষা",
    gu: "ભાષા",
    kn: "ಭಾಷೆ",
  },
  "checkin.question": {
    en: "Question",
    hi: "प्रश्न",
    mr: "प्रश्न",
    ta: "கேள்வி",
    te: "ప్రశ్న",
    bn: "প্রশ্ন",
    gu: "પ્રશ્ન",
    kn: "ಪ್ರಶ್ನೆ",
  },
  "checkin.context": {
    en: "Context",
    hi: "संदर्भ",
    mr: "संदर्भ",
    ta: "சூழல்",
    te: "సందర్భం",
    bn: "প্রসঙ্গ",
    gu: "સંદર્ભ",
    kn: "ಸಂದರ್ಭ",
  },
  "checkin.tag": {
    en: "Developmental check",
    hi: "विकासात्मक जाँच",
    mr: "विकासात्मक तपासणी",
    ta: "வளர்ச்சி பரிசோதனை",
    te: "అభివృద్ధి పరీక్ష",
    bn: "বিকাশ পরীক্ষা",
    gu: "વિકાસ તપાસ",
    kn: "ಬೆಳವಣಿಗೆ ಪರೀಕ್ಷೆ",
  },
  "checkin.back": {
    en: "Back",
    hi: "पीछे",
    mr: "मागे",
    ta: "பின்செல்",
    te: "వెనుకకు",
    bn: "পিছনে",
    gu: "પાછળ",
    kn: "ಹಿಂದೆ",
  },
  "checkin.complete": {
    en: "complete",
    hi: "पूर्ण",
    mr: "पूर्ण",
    ta: "முடிந்தது",
    te: "పూర్తయింది",
    bn: "সম্পূর্ণ",
    gu: "પૂર્ણ",
    kn: "ಪೂರ್ಣ",
  },
  "checkin.answerYes": {
    en: "Yes, does this consistently",
    hi: "हाँ, हमेशा करता/करती है",
    mr: "होय, नेहमी करतो/करते",
    ta: "ஆம், எப்போதும் செய்கிறார்",
    te: "అవును, ఎల్లప్పుడూ చేస్తారు",
    bn: "হ্যাঁ, সবসময় করে",
    gu: "હા, હંમેશા કરે છે",
    kn: "ಹೌದು, ಯಾವಾಗಲೂ ಮಾಡುತ್ತಾರೆ",
  },
  "checkin.answerSometimes": {
    en: "Sometimes or with help",
    hi: "कभी-कभी या मदद से",
    mr: "कधीकधी किंवा मदतीने",
    ta: "சில நேரம் அல்லது உதவியுடன்",
    te: "కొన్నిసార్లు లేదా సహాయంతో",
    bn: "মাঝে মাঝে বা সহায়তায়",
    gu: "ક્યારેક અથવા મદદ સાથે",
    kn: "ಕೆಲವೊಮ್ಮೆ ಅಥವಾ ಸಹಾಯದಿಂದ",
  },
  "checkin.answerNotYet": {
    en: "Not yet / significant difficulty",
    hi: "अभी नहीं / काफ़ी कठिनाई",
    mr: "अजून नाही / खूप अडचण",
    ta: "இன்னும் இல்லை / கணிசமான சிரமம்",
    te: "ఇంకా లేదు / గణనీయమైన కష్టం",
    bn: "এখনও না / উল্লেখযোগ্য কঠিনতা",
    gu: "હજુ નહીં / ઘણી મુશ્કેલી",
    kn: "ಇನ್ನೂ ಇಲ್ಲ / ಗಮನಾರ್ಹ ಕಷ್ಟ",
  },
  "checkin.yes": {
    en: "Yes",
    hi: "हाँ",
    mr: "होय",
    ta: "ஆம்",
    te: "అవును",
    bn: "হ্যাঁ",
    gu: "હા",
    kn: "ಹೌದು",
  },
  "checkin.no": {
    en: "No",
    hi: "नहीं",
    mr: "नाही",
    ta: "இல்லை",
    te: "కాదు",
    bn: "না",
    gu: "ના",
    kn: "ಇಲ್ಲ",
  },
  "checkin.notSure": {
    en: "Not sure",
    hi: "पता नहीं",
    mr: "माहीत नाही",
    ta: "தெரியவில்லை",
    te: "తెలియదు",
    bn: "নিশ্চিত নই",
    gu: "ખબર નથી",
    kn: "ಗೊತ್ತಿಲ್ಲ",
  },
  "checkin.regression": {
    en: "Has the child stopped doing something they used to do?",
    hi: "क्या बच्चे ने कोई ऐसा काम करना बंद कर दिया जो पहले करता था?",
    mr: "मुलाने आधी करत असलेले काही करणे थांबवले आहे का?",
    ta: "குழந்தை முன்பு செய்த ஒன்றை இப்போது செய்வதை நிறுத்திவிட்டதா?",
    te: "పిల్లవాడు ముందు చేసిన పనిని ఇప్పుడు ఆపేశాడా?",
    bn: "শিশু আগে যা করত এখন তা করা বন্ধ করেছে কি?",
    gu: "બાળકે પહેલા કરતું કંઈક કરવાનું બંધ કર્યું છે?",
    kn: "ಮಗು ಮೊದಲು ಮಾಡುತ್ತಿದ್ದದ್ದನ್ನು ಈಗ ಮಾಡುವುದನ್ನು ನಿಲ್ಲಿಸಿದೆಯೇ?",
  },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang] ?? STRINGS[key].en;
}

/** Every language value for a key (used by the completeness test). */
export function tAll(key: StringKey): Entry {
  return STRINGS[key];
}
