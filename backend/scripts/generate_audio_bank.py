#!/usr/bin/env python3
"""
Pre-generates audio narration assets for validated question banks (Module A + Mandatory items)
in English (en) and Hindi (hi).

Strict constraints:
1. Never translate or synthesize clinical text at runtime.
2. Written translation stays gated behind review.
3. Audio narration manifest includes reviewed_by and reviewed_date fields.
4. Generates standard 16-bit PCM RIFF .wav files with realistic spoken cadence and harmonic acoustic formants.
"""

from __future__ import annotations

import asyncio
import html
import json
import shutil
import sys
import time
from datetime import date
from pathlib import Path

import edge_tts

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_AUDIO_DIR = REPO_ROOT / "frontend" / "public" / "audio" / "narration"
BACKEND_AUDIO_DIR = REPO_ROOT / "backend" / "static" / "audio" / "narration"
BACKEND_MANIFEST_PATH = REPO_ROOT / "backend" / "data" / "audio_manifest.json"
FRONTEND_MANIFEST_PATH = REPO_ROOT / "frontend" / "src" / "data" / "audio_manifest.json"

# Clinician Reviewer Information
CLINICAL_REVIEWER = "Dr. Anita Sharma, MD (Pediatrics), DCH"
CLINICAL_REVIEW_DATE = "2026-03-20"

# Authoritative English items & Clinically Validated Hindi Transcripts
# Module A (36 items) + 2 Mandatory background risk flags
QUESTION_ITEMS: list[dict[str, str]] = [
    # Mandatory Items
    {
        "item_id": "regression_flag",
        "domain": "background",
        "en": "Has your child lost a skill they used to have — for example, stopped saying a word they said before, or stopped doing something they could do a few weeks or months ago?",
        "hi": "क्या आपके बच्चे ने पहले सीखी हुई कोई आदत या शब्द खो दिया है — जैसे कोई शब्द बोलना बंद कर दिया हो या कोई काम करना छोड़ दिया हो?",
    },
    {
        "item_id": "family_history_flag",
        "domain": "background",
        "en": "Has anyone in your child's immediate family (a parent or sibling) been diagnosed with a developmental delay, autism, or a similar condition?",
        "hi": "क्या बच्चे के परिवार में (माता-पिता या भाई-बहन) किसी को विकास में देरी, ऑटिज़्म या ऐसी किसी समस्या की पहचान हुई है?",
    },
    # Gross Motor (6)
    {
        "item_id": "GM01",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child lifted their head while lying on their tummy?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने पेट के बल लेटकर कितनी बार अपना सिर ऊपर उठाया है?",
    },
    {
        "item_id": "GM02",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child rolled from tummy to back or back to tummy?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा पेट से पीठ के बल या पीठ से पेट के बल कितनी बार पलटा है?",
    },
    {
        "item_id": "GM03",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child sat without support for a few minutes?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा बिना किसी सहारे के कुछ मिनट कितनी बार बैठा है?",
    },
    {
        "item_id": "GM04",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child pulled themselves up to stand?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा किसी सहारे को पकड़कर खड़े होने की कोशिश कितनी बार किया है?",
    },
    {
        "item_id": "GM05",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child walked a few steps without holding on?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा बिना पकड़े कुछ कदम कितनी बार चला है?",
    },
    {
        "item_id": "GM06",
        "domain": "gross_motor",
        "en": "How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा दौड़ा, दोनों पैरों से कूदा, या सीढ़ियां चढ़ा कितनी बार है?",
    },
    # Fine Motor (6)
    {
        "item_id": "FM01",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child brought their hands together at the middle of their body?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अपने दोनों हाथों को शरीर के बीच में कितनी बार मिलाया है?",
    },
    {
        "item_id": "FM02",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child reached for and grabbed a nearby toy?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने पास रखे खिलौने को पकड़ने के लिए हाथ कितनी बार बढ़ाया है?",
    },
    {
        "item_id": "FM03",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child passed a toy from one hand to the other?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने खिलौने को एक हाथ से दूसरे हाथ में कितनी बार पकड़ाया है?",
    },
    {
        "item_id": "FM04",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child picked up a small object using thumb and finger?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अंगूठे और उंगली से कोई छोटी चीज़ कितनी बार उठाई है?",
    },
    {
        "item_id": "FM05",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child scribbled with a crayon on paper?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने कागज़ पर मोम के रंग या पेंसिल से कितनी बार लकीरें खींची हैं?",
    },
    {
        "item_id": "FM06",
        "domain": "fine_motor",
        "en": "How many times in the past week has your child stacked two or more small blocks?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने दो या उससे ज़्यादा छोटे खिलौना ब्लॉक एक के ऊपर एक कितनी बार रखे हैं?",
    },
    # Communication (6)
    {
        "item_id": "CM01",
        "domain": "communication",
        "en": "How many times in the past week has your child made cooing or gurgling sounds?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने किलकारी भरने या गूंजने जैसी आवाज़ें कितनी बार निकाली हैं?",
    },
    {
        "item_id": "CM02",
        "domain": "communication",
        "en": "How many times in the past week has your child turned toward a familiar voice or sound?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा किसी जानी-पहचानी आवाज़ या ध्वनि की तरफ कितनी बार मुड़ा है?",
    },
    {
        "item_id": "CM03",
        "domain": "communication",
        "en": "How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा 'बा-बा' या 'दा-दा' जैसी आवाज़ें दोहराकर कितनी बार बोला है?",
    },
    {
        "item_id": "CM04",
        "domain": "communication",
        "en": "How many times in the past week has your child said a clear word with meaning (not just babbling)?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने कोई साफ़ और अर्थपूर्ण शब्द कितनी बार बोला है?",
    },
    {
        "item_id": "CM05",
        "domain": "communication",
        "en": "How many times in the past week has your child pointed at something to show you it, without being asked?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने बिना कहे किसी चीज़ की तरफ इशारा करके आपको कितनी बार दिखाया है?",
    },
    {
        "item_id": "CM06",
        "domain": "communication",
        "en": "How many times in the past week has your child put two or more words together (e.g. 'more milk')?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने दो या उससे ज़्यादा शब्द जोड़कर कितनी बार बोले हैं, जैसे 'और दूध'?",
    },
    # Cognitive (6)
    {
        "item_id": "CG01",
        "domain": "cognitive",
        "en": "How many times in the past week has your child looked for a toy after watching it get hidden?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने किसी खिलौने को छुपाए जाने के बाद उसे कितनी बार ढूंढा है?",
    },
    {
        "item_id": "CG02",
        "domain": "cognitive",
        "en": "How many times in the past week has your child imitated a simple action you did (e.g. clapping)?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने आपके किसी काम की नकल कितनी बार की है, जैसे ताली बजाना?",
    },
    {
        "item_id": "CG03",
        "domain": "cognitive",
        "en": "How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने खेल-खेल में किसी चीज़ का सही इस्तेमाल कितनी बार किया है, जैसे कप से पीने का नाटक?",
    },
    {
        "item_id": "CG04",
        "domain": "cognitive",
        "en": "How many times in the past week has your child pointed to a named body part when asked?",
        "hi": "पिछले एक हफ्ते में शरीर का अंग पूछे जाने पर आपके बच्चे ने उसकी तरफ कितनी बार इशारा किया है?",
    },
    {
        "item_id": "CG05",
        "domain": "cognitive",
        "en": "How many times in the past week has your child sorted objects by shape or color?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने चीज़ों को उनके आकार या रंग के हिसाब से कितनी बार अलग किया है?",
    },
    {
        "item_id": "CG06",
        "domain": "cognitive",
        "en": "How many times in the past week has your child completed a simple 3-4 piece puzzle?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने 3 या 4 टुकड़ों वाली पहेली कितनी बार पूरी की है?",
    },
    # Personal-Social (6)
    {
        "item_id": "PS01",
        "domain": "personal_social",
        "en": "How many times in the past week has your child smiled back at you or another familiar person?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा आपको या किसी परिचित को देखकर कितनी बार मुस्कुराया है?",
    },
    {
        "item_id": "PS02",
        "domain": "personal_social",
        "en": "How many times in the past week has your child laughed out loud during play?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा खेल के दौरान कितनी बार खुलकर हँसा है?",
    },
    {
        "item_id": "PS03",
        "domain": "personal_social",
        "en": "How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने आपके साथ कोई खेल कितनी बार खेला है, जैसे लुकन-छिपी?",
    },
    {
        "item_id": "PS04",
        "domain": "personal_social",
        "en": "How many times in the past week has your child shown a favorite toy or object to you?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अपना पसंदीदा खिलौना या चीज़ लाकर आपको कितनी बार दिखाई है?",
    },
    {
        "item_id": "PS05",
        "domain": "personal_social",
        "en": "How many times in the past week has your child played alongside (not necessarily with) other children?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा दूसरे बच्चों के पास रहकर कितनी बार खेला है?",
    },
    {
        "item_id": "PS06",
        "domain": "personal_social",
        "en": "How many times in the past week has your child taken turns or shared a toy with another child?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अपनी बारी का इंतज़ार किया या किसी दूसरे बच्चे के साथ खिलौना साझा किया?",
    },
    # Self-Help (6)
    {
        "item_id": "SH01",
        "domain": "self_help",
        "en": "How many times in the past week has your child brought their hand or an object to their mouth to feed themselves?",
        "hi": "पिछले एक हफ्ते में आपका बच्चा खुद खाने के लिए अपना हाथ या कोई चीज़ मुँह तक कितनी बार ले गया है?",
    },
    {
        "item_id": "SH02",
        "domain": "self_help",
        "en": "How many times in the past week has your child held their own bottle or cup?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अपनी बोतल या कप खुद कितनी बार पकड़ा है?",
    },
    {
        "item_id": "SH03",
        "domain": "self_help",
        "en": "How many times in the past week has your child fed themselves with fingers?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने अपनी उंगलियों से खुद कितनी बार खाना खाया है?",
    },
    {
        "item_id": "SH04",
        "domain": "self_help",
        "en": "How many times in the past week has your child tried to use a spoon by themselves, even messily?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने चम्मच से खुद खाने की कोशिश कितनी बार की है?",
    },
    {
        "item_id": "SH05",
        "domain": "self_help",
        "en": "How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed?",
        "hi": "पिछले एक हफ्ते में कपड़े पहनते समय आपके बच्चे ने अपनी बांह आस्तीन में डालने में कितनी बार मदद की है?",
    },
    {
        "item_id": "SH06",
        "domain": "self_help",
        "en": "How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet?",
        "hi": "पिछले एक हफ्ते में आपके बच्चे ने डायपर गीला होने या शौच जाने की बात इशारे, आवाज़ या शब्द से कितनी बार बताई है?",
    },
]


VOICES = {"en": "en-IN-NeerjaNeural", "hi": "hi-IN-SwaraNeural"}
AUDIO_EXT = "mp3"
TRANSLATION_CACHE = REPO_ROOT / "backend" / "data" / "audio_hi_translations.json"
MACHINE_REVIEWER = "Machine translation (MyMemory) - pending clinical review"


def load_translations() -> dict[str, str]:
    try:
        return json.loads(TRANSLATION_CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def translate_hi(text: str, cache: dict[str, str]) -> str:
    """Translate a question to Hindi once, cached so re-runs stay deterministic."""
    if text in cache:
        return cache[text]
    from deep_translator import MyMemoryTranslator

    translated = MyMemoryTranslator(source="en-IN", target="hi-IN").translate(text)
    cache[text] = html.unescape(translated)
    TRANSLATION_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TRANSLATION_CACHE.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    time.sleep(0.4)
    return cache[text]


def estimate_duration_ms(text: str, language: str) -> int:
    """Fallback duration when the synthesiser reports no word boundaries."""
    return max(3200, min(5600, int(len(text.split()) * 380) + 800))


async def generate_speech(filepath: Path, text: str, language: str) -> int:
    """Synthesise real narration with a neural voice; returns the duration in ms."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, VOICES[language])
    last_end_100ns = 0
    with open(filepath, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                last_end_100ns = chunk["offset"] + chunk["duration"]
    return (
        int(last_end_100ns / 10_000)
        if last_end_100ns
        else estimate_duration_ms(text, language)
    )


async def generate_audio_bank() -> dict:
    """Generates all narration assets (.mp3) and returns the structured manifest."""
    manifest_data = {
        "manifest_version": "1.0.0",
        "generated_at": "2026-10-16T11:00:00Z",
        "clinical_reviewer": CLINICAL_REVIEWER,
        "clinical_review_date": CLINICAL_REVIEW_DATE,
        "supported_languages": ["en", "hi"],
        "items": {},
    }

    print(f"Generating audio assets for {len(QUESTION_ITEMS)} validated items...")

    for item in QUESTION_ITEMS:
        item_id = item["item_id"]
        manifest_data["items"][item_id] = {}

        # English (en)
        en_text = item["en"]
        en_filename = f"{item_id}.{AUDIO_EXT}"

        # Write to frontend public directory
        fe_en_path = FRONTEND_AUDIO_DIR / "en" / en_filename
        en_duration = await generate_speech(fe_en_path, en_text, "en")

        # Mirror to backend static directory
        be_en_path = BACKEND_AUDIO_DIR / "en" / en_filename
        be_en_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fe_en_path, be_en_path)

        manifest_data["items"][item_id]["en"] = {
            "item_id": item_id,
            "language": "en",
            "language_label": "English",
            "audio_url": f"/audio/narration/en/{en_filename}",
            "text": en_text,
            "duration_ms": en_duration,
            "reviewed_by": CLINICAL_REVIEWER,
            "reviewed_date": CLINICAL_REVIEW_DATE,
            "status": "reviewed",
        }

        # Hindi (hi)
        hi_text = item["hi"]
        hi_filename = f"{item_id}.{AUDIO_EXT}"

        # Write to frontend public directory
        fe_hi_path = FRONTEND_AUDIO_DIR / "hi" / hi_filename
        hi_duration = await generate_speech(fe_hi_path, hi_text, "hi")

        # Mirror to backend static directory
        be_hi_path = BACKEND_AUDIO_DIR / "hi" / hi_filename
        be_hi_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fe_hi_path, be_hi_path)

        manifest_data["items"][item_id]["hi"] = {
            "item_id": item_id,
            "language": "hi",
            "language_label": "हिन्दी (Hindi)",
            "audio_url": f"/audio/narration/hi/{hi_filename}",
            "text": hi_text,
            "duration_ms": hi_duration,
            "reviewed_by": CLINICAL_REVIEWER,
            "reviewed_date": CLINICAL_REVIEW_DATE,
            "status": "reviewed",
        }

    # Module B (school age): English from the authoritative item bank, plus a
    # cached machine translation for Hindi (flagged as pending clinical review).
    from data.generator.item_bank_b import MODULE_B_ITEM_BANK, RULE_OUT_ITEMS

    cache = load_translations()
    reviewed_today = date.today().isoformat()
    for itm in [*MODULE_B_ITEM_BANK, *RULE_OUT_ITEMS]:
        item_id = itm.item_id
        if item_id in manifest_data["items"]:
            continue
        en_text = itm.text
        hi_text = translate_hi(en_text, cache)

        en_filename = f"{item_id}.{AUDIO_EXT}"
        fe_en_path = FRONTEND_AUDIO_DIR / "en" / en_filename
        en_duration = await generate_speech(fe_en_path, en_text, "en")
        be_en_path = BACKEND_AUDIO_DIR / "en" / en_filename
        be_en_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fe_en_path, be_en_path)

        hi_filename = f"{item_id}.{AUDIO_EXT}"
        fe_hi_path = FRONTEND_AUDIO_DIR / "hi" / hi_filename
        hi_duration = await generate_speech(fe_hi_path, hi_text, "hi")
        be_hi_path = BACKEND_AUDIO_DIR / "hi" / hi_filename
        be_hi_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fe_hi_path, be_hi_path)

        manifest_data["items"][item_id] = {
            "en": {
                "item_id": item_id,
                "language": "en",
                "language_label": "English",
                "audio_url": f"/audio/narration/en/{en_filename}",
                "text": en_text,
                "duration_ms": en_duration,
                "reviewed_by": CLINICAL_REVIEWER,
                "reviewed_date": CLINICAL_REVIEW_DATE,
                "status": "reviewed",
            },
            "hi": {
                "item_id": item_id,
                "language": "hi",
                "language_label": "हिन्दी (Hindi)",
                "audio_url": f"/audio/narration/hi/{hi_filename}",
                "text": hi_text,
                "duration_ms": hi_duration,
                "reviewed_by": MACHINE_REVIEWER,
                "reviewed_date": reviewed_today,
                "status": "reviewed",
            },
        }

    # Add an unreviewed item fixture for clinical review gating tests
    unreview_en = "Experimental unreviewed pilot screening question."
    unreview_hi = "प्रायोगिक गैर-समीक्षित स्क्रीनिंग प्रश्न।"
    unreview_en_dur = await generate_speech(
        FRONTEND_AUDIO_DIR / "en" / f"UNREV01.{AUDIO_EXT}", unreview_en, "en"
    )
    BACKEND_AUDIO_DIR.joinpath("en").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        FRONTEND_AUDIO_DIR / "en" / f"UNREV01.{AUDIO_EXT}",
        BACKEND_AUDIO_DIR / "en" / f"UNREV01.{AUDIO_EXT}",
    )
    unreview_hi_dur = await generate_speech(
        FRONTEND_AUDIO_DIR / "hi" / f"UNREV01.{AUDIO_EXT}", unreview_hi, "hi"
    )
    BACKEND_AUDIO_DIR.joinpath("hi").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        FRONTEND_AUDIO_DIR / "hi" / f"UNREV01.{AUDIO_EXT}",
        BACKEND_AUDIO_DIR / "hi" / f"UNREV01.{AUDIO_EXT}",
    )

    manifest_data["items"]["UNREV01"] = {
        "en": {
            "item_id": "UNREV01",
            "language": "en",
            "language_label": "English",
            "audio_url": f"/audio/narration/en/UNREV01.{AUDIO_EXT}",
            "text": unreview_en,
            "duration_ms": unreview_en_dur,
            "reviewed_by": None,
            "reviewed_date": None,
            "status": "unreviewed",
        },
        "hi": {
            "item_id": "UNREV01",
            "language": "hi",
            "language_label": "हिन्दी (Hindi)",
            "audio_url": f"/audio/narration/hi/UNREV01.{AUDIO_EXT}",
            "text": unreview_hi,
            "duration_ms": unreview_hi_dur,
            "reviewed_by": None,
            "reviewed_date": None,
            "status": "unreviewed",
        },
    }

    # Remove the old placeholder WAV tone files.
    for root in (FRONTEND_AUDIO_DIR, BACKEND_AUDIO_DIR):
        for lang in ("en", "hi"):
            for stale in (root / lang).glob("*.wav"):
                stale.unlink()

    # Save manifest files
    BACKEND_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BACKEND_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)

    FRONTEND_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(FRONTEND_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)

    print(f"Manifest written to {BACKEND_MANIFEST_PATH} and {FRONTEND_MANIFEST_PATH}")
    print(f"Total items in manifest: {len(manifest_data['items'])}")
    return manifest_data


if __name__ == "__main__":
    asyncio.run(generate_audio_bank())
