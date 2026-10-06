"""Independent hand-written evaluation notes for the Module B router.

These were written by hand, NOT assembled by generate_text_dataset.py, and
never used for training or threshold tuning. They exist because metrics on
generator-made text can flatter a model that has only learned the generator's
templates. Labels are the author's judgement; a clinician/educator should
re-label before any claim beyond "pipeline sanity check".

Run: python src/make_handwritten_eval.py  ->  data/handwritten_eval_b.csv
"""
import csv
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (text, lang, labels)   labels: '|'-joined; '' = genuinely unclear (no domain)
NOTES = [
    # ---- English, parent
    ("He just cannot sit through homework. Ten minutes and he is up for water, then the toilet, then something else. Teacher says the same thing.", "en", "attention_work"),
    ("She reads aloud like a much younger child, guesses words from the first letter and loses her place on the page.", "en", "reading"),
    ("My son knows the answer when I ask him but his written answers are one or two lines and the handwriting is so messy that even he can't read it later.", "en", "writing"),
    ("Maths is a nightmare. She still counts on fingers for 7+5 and the tables just do not stay in her head.", "en", "numbers"),
    ("He trips over his own feet, drops things, and can't catch a ball. Other kids laugh at him during PT.", "en", "motor|social"),
    ("She cries every Sunday night and says her stomach hurts so she doesn't have to go to school.", "en", "emotion_school|ctx_school_refusal"),
    ("He doesn't have any friends in class. At lunch he sits alone and the others don't include him in games.", "en", "social"),
    ("My daughter gets very angry over small things, throws her bag and shouts at us, then feels guilty.", "en", "emotion_school"),
    ("He speaks in short broken sentences and can't explain what happened at school; his younger cousin talks better.", "en", "listening_speaking"),
    ("He sits very close to the TV and squints at the board. The teacher moved him to the front but he still says the letters look blurry.", "en", "vision_hearing"),
    ("She is smart but when exams come she freezes and gets stomach aches. She says she will fail and everyone will be angry.", "en", "emotion_school|ctx_pressure"),
    ("Our son is on the phone five or six hours a day and turns violent if we take it away. Homework doesn't happen anymore.", "en", "ctx_screen|emotion_school"),
    ("He forgets his water bottle, his tiffin, his homework copy, every single day, and loses a pencil every week.", "en", "attention_work"),
    ("She mixes up b and d, reads 'was' as 'saw' and her spelling is all over the place even for words she has seen many times.", "en", "reading|writing"),
    ("When I say get your bag, shoes and come, he brings only the bag. Two or three things together just don't register.", "en", "listening_speaking"),
    ("Two older boys bullied him on the school bus. Now he refuses to board it and his marks have dropped.", "en", "ctx_bullying|ctx_school_refusal"),
    ("She looks away when spoken to, lines up her toys in exact order and has a meltdown if the routine changes. She only talks about dinosaurs.", "en", "global_asd"),
    ("At nine he still can't tie shoelaces or button his school shirt, and his pencil grip is so awkward that he tires after a few lines.", "en", "motor|writing"),
    ("She doesn't fall asleep before midnight and is exhausted in class. The teacher found her sleeping on the desk.", "en", "ctx_sleep"),
    ("We moved him from Hindi medium to English medium and he understands almost nothing in class now. He stays silent and marks have fallen.", "en", "ctx_language"),
    # ---- Hinglish, parent
    ("Mera beta homework pe 5 minute bhi nahi baithta, bar bar uth jata hai, pencil se khelta rehta hai.", "hr", "attention_work"),
    ("Beti ko padhne mein bahut problem hai, har shabd atak atak ke padhti hai aur line chhod deti hai.", "hr", "reading"),
    ("Uski handwriting bahut kharab hai, copy mein kuch samajh nahi aata aur spelling bhi galat likhta hai.", "hr", "writing"),
    ("Ganit mein bilkul weak hai, pahade yaad nahi hote aur ghadi dekhna bhi nahi aata, 10 saal ka hai.", "hr", "numbers"),
    ("Khelte waqt gir jata hai, gend nahi pakad pata, cycle bhi abhi tak nahi seekhi.", "hr", "motor"),
    ("School jane ke naam pe ro padti hai, pet dard ka bahana banati hai, subah bahut tantrum karti hai.", "hr", "emotion_school|ctx_school_refusal"),
    ("Koi dost nahi hai uska, class mein akela baithta hai aur bachche usse khelne nahi bulate.", "hr", "social"),
    ("Chhoti chhoti baat pe bahut gussa karta hai, cheezein phenk deta hai, badon ko jawab deta hai.", "hr", "emotion_school"),
    ("Wo apni baat theek se explain nahi kar pata, bolte bolte atak jata hai aur kai baar sahi shabd nahi milta.", "hr", "listening_speaking"),
    ("Board pe likha dikhta nahi usko, aankhein siktod ke dekhta hai, aur sar dard ki shikayat karta hai.", "hr", "vision_hearing"),
    ("Exam ka naam sunte hi ghabra jata hai, kehta hai main fail ho jaunga, sab naraz honge.", "hr", "emotion_school|ctx_pressure"),
    ("Din bhar mobile pe game khelta hai, mana karo to chillata hai, padhai bilkul band ho gayi.", "hr", "ctx_screen|emotion_school"),
    ("Roz kuch na kuch bhool jata hai, kabhi tiffin kabhi copy, aur sawal mein jaldbazi se galtiyan karta hai.", "hr", "attention_work"),
    ("Mere bete ko bar bar bulao tab sunta hai, TV ki awaaz bahut tez rakhta hai aur kya kya bolta rehta hai.", "hr", "vision_hearing|listening_speaking"),
    ("School mein bade bachche usko marte hain aur paise cheen lete hain, ab school jaane se darta hai.", "hr", "ctx_bullying|ctx_school_refusal"),
    ("Wo apni hi duniya mein rehta hai, aankh nahi milata, ek hi khilone ko line mein lagata hai aur routine badle to chillata hai.", "hr", "global_asd"),
    ("Button aur zip khud nahi laga pata, kainchi se seedha nahi kaat pata.", "hr", "motor"),
    ("Raat ko der tak jaagta hai, subah uthta nahi, class mein sota rehta hai.", "hr", "ctx_sleep"),
    ("Gaon se shehar aaye hain, school English medium hai, usko kuch samajh nahi aata aur chup rehta hai.", "hr", "ctx_language"),
    ("Wo apne se chhote bachchon ke saath hi khelta hai, apni umar ke bachche usko nahi samajhte.", "hr", "social"),
    # ---- Hindi (Devanagari)
    ("मेरा बेटा एक जगह टिककर नहीं बैठता, हर पाँच मिनट में उठ जाता है, होमवर्क अधूरा छोड़ देता है।", "hi", "attention_work"),
    ("बेटी को अक्षर पहचानने में दिक्कत होती है, 'ब' और 'द' में गड़बड़ करती है, धीरे-धीरे अटककर पढ़ती है।", "hi", "reading"),
    ("उसके हाथ की लिखावट बहुत खराब है और वो वर्तनी की बहुत गलतियाँ करता है।", "hi", "writing"),
    ("गणित में गिनती और जोड़-घटाव में बहुत गलतियाँ करती है, पहाड़े याद नहीं रहते।", "hi", "numbers"),
    ("वो बहुत जल्दी रो पड़ता है, स्कूल जाने से डरता है और कहता है पेट में दर्द है।", "hi", "emotion_school|ctx_school_refusal"),
    ("उसका कोई दोस्त नहीं है, सब बच्चे उसे खेल में शामिल नहीं करते।", "hi", "social"),
    ("दौड़ते समय बार-बार गिर जाता है और गेंद नहीं पकड़ पाता।", "hi", "motor"),
    ("वो अपनी बात पूरे वाक्य में नहीं कह पाती, सही शब्द ढूँढने में अटकती है।", "hi", "listening_speaking"),
    ("बोर्ड पर लिखा उसे साफ़ नहीं दिखता, आँखें मिचमिचाता है।", "hi", "vision_hearing"),
    ("मोबाइल छीनने पर गुस्से में चीज़ें फेंकता है, पूरा दिन फोन पर रहता है।", "hi", "ctx_screen|emotion_school"),
    # ---- Teacher voice
    ("Teacher's note: Rahul cannot stay seated for more than a few minutes, calls out answers and disturbs the row. Happens in every period.", "en", "attention_work"),
    ("In class, Meena avoids reading aloud, copies from neighbours and her notebook has many letter reversals.", "en", "reading|writing"),
    ("Class mein Aman kisi se baat nahi karta, akela baithta hai, aur group work mein shamil nahi hota.", "hr", "social"),
    ("Student takes very long to finish board work. Handwriting is slow and very untidy though oral answers are excellent.", "en", "writing"),
    ("Sana forgets instructions immediately, needs everything repeated, and looks at me blankly when I speak from the back of the room.", "en", "listening_speaking|vision_hearing"),
    ("She falls asleep in class most days and is irritable with classmates.", "en", "ctx_sleep|emotion_school"),
    ("Cannot do simple subtraction with borrowing and panics when called to the board for maths.", "en", "numbers|emotion_school"),
    ("Karan ne class mein kaha ki wo jeena nahi chahta. Maine uski copy mein bhi yahi likha dekha.", "hr", "safety|emotion_school"),
    # ---- Vague (no domain should be asserted)
    ("Padhai mein bahut kamzor hai, samajh nahi aa raha kya karein.", "hr", ""),
    ("My son is just not like other kids. Please help.", "en", ""),
    ("Teacher ne parent meeting ke liye bulaya hai, shikayat kar rahi thi.", "hr", ""),
    ("बेटे के नंबर बहुत कम आ रहे हैं।", "hi", ""),
    ("She is not doing well in school this year.", "en", ""),
    ("Bachcha theek nahi lag raha, kuch alag hai.", "hr", ""),
    # ---- Safety
    ("He told me yesterday that he wants to die because everybody hates him.", "en", "safety|emotion_school"),
    ("Meri beti ne kaha ki main khud ko khatam kar lungi.", "hr", "safety|emotion_school"),
    ("Uncle ne usko galat tarike se chhua aur wo ab kisi se baat nahi karti.", "hr", "safety"),
    ("She has marks on her arms and says she hurt herself on purpose when she is sad.", "en", "safety|emotion_school"),
    ("बेटा कहता है कि वो मर जाना चाहता है।", "hi", "safety"),
    ("The teacher hits him with a scale every day and he is scared to go to school.", "en", "safety|ctx_school_refusal"),
    # ---- Negation / tricky
    ("He is fine in reading and maths, no issues with friends, but he can't sit still and forgets everything.", "en", "attention_work"),
    ("Her handwriting is beautiful and she reads very well. What bothers me is that she gets angry and cries a lot.", "en", "emotion_school"),
    ("Doctor said eyes and ears are normal. Still he doesn't follow what is said in class and needs everything repeated.", "en", "listening_speaking"),
    ("Padhai theek hai, dost bhi hain, bas khel mein gir jata hai aur gend nahi pakad pata.", "hr", "motor"),
    ("No problem at home, but school says he is disruptive and doesn't finish work.", "en", "attention_work"),
    ("She is good at sports and has lots of friends. Her only issue is spelling and slow reading.", "en", "reading|writing"),
]

LABELS = [
    "attention_work", "listening_speaking", "reading", "writing", "numbers", "motor",
    "social", "emotion_school", "vision_hearing", "global_asd", "safety",
    "ctx_bullying", "ctx_school_refusal", "ctx_screen", "ctx_language", "ctx_pressure", "ctx_sleep",
]

if __name__ == "__main__":
    out = os.path.join(ROOT, "data", "handwritten_eval_b.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "text", "lang", "labels"] + LABELS + ["is_unclear"])
        for i, (t, lang, labs) in enumerate(NOTES):
            ls = set(x for x in labs.split("|") if x)
            assert ls <= set(LABELS), ls - set(LABELS)
            w.writerow([f"H{i:03d}", t, lang, labs] + [int(l in ls) for l in LABELS] + [int(not ls)])
    print("wrote", out, len(NOTES), "notes")
