"""Slot vocabularies for the Module B question bank.

Each slot maps age_band -> list of situation phrases. A stem such as
"Needs repeated reminders before beginning {task}" is expanded once per
(age band, slot value), so a 6-year-old is asked about a worksheet and a
12-year-old about exam preparation. `<slot>_t` is the classroom (teacher
form) variant; if missing, the home variant is reused.
"""

BANDS = ["5-7", "8-10", "11-12"]

SLOTS = {
    "task": {
        "5-7": ["colouring or a drawing activity", "a worksheet", "a simple written task"],
        "8-10": ["homework", "a classwork exercise", "a school project"],
        "11-12": ["homework or revision", "an assignment", "exam preparation"],
    },
    "task_t": {
        "5-7": ["a worksheet", "a classroom activity", "a colouring or drawing task"],
        "8-10": ["classwork", "a written exercise", "a group activity"],
        "11-12": ["classwork", "a written test or assignment", "a group project"],
    },
    "read": {
        "5-7": ["a simple picture book", "a short story in large print", "words on a chart or flash card"],
        "8-10": ["a textbook paragraph", "a short story", "a worksheet passage"],
        "11-12": ["a textbook chapter", "a newspaper or magazine passage", "exam questions"],
    },
    "write": {
        "5-7": ["a short sentence", "letters and numbers", "a few words from the board"],
        "8-10": ["a few sentences about a topic", "answers in a notebook", "notes from the board"],
        "11-12": ["a paragraph or short essay", "answers in several lines", "notes during class"],
    },
    "math": {
        "5-7": ["counting objects", "simple addition and subtraction", "comparing which group has more"],
        "8-10": ["multiplication tables", "word problems", "carrying and borrowing in sums"],
        "11-12": ["fractions and decimals", "multi-step problems", "percentages or measurements"],
    },
    "game": {
        "5-7": ["a playground game", "a ball game", "a board or card game"],
        "8-10": ["a team game", "a sport", "a board or card game"],
        "11-12": ["a team sport", "a group game", "a group project"],
    },
    "instr": {
        "5-7": ["a two-step instruction", "an instruction given only once"],
        "8-10": ["a three-step instruction", "instructions given to the whole class"],
        "11-12": ["a multi-part instruction", "instructions given only once"],
    },
    "peer": {
        "5-7": ["other children in the neighbourhood", "classmates"],
        "8-10": ["classmates", "children in the neighbourhood", "cousins of the same age"],
        "11-12": ["classmates", "friends", "children in the neighbourhood"],
    },
    "exam": {
        "5-7": ["answering in front of the class", "a class activity with the teacher watching"],
        "8-10": ["a class test", "reading aloud in class", "answering in front of the class"],
        "11-12": ["an exam", "a presentation", "a unit test"],
    },
    "speak": {
        "5-7": ["telling news or a story", "answering the teacher's question", "asking for help"],
        "8-10": ["explaining what happened", "describing a picture or an event", "giving a short talk"],
        "11-12": ["explaining an idea", "telling a story in order", "giving a short presentation"],
    },
    "fine": {
        "5-7": ["using scissors", "buttoning or zipping clothes", "holding a crayon or pencil"],
        "8-10": ["cutting along a line", "tying shoelaces", "using a ruler or compass"],
        "11-12": ["drawing neat diagrams", "using geometry tools", "packing a bag neatly"],
    },
    "gross": {
        "5-7": ["hopping or skipping", "catching a big ball", "climbing playground equipment"],
        "8-10": ["catching and throwing a ball", "riding a bicycle", "skipping with a rope"],
        "11-12": ["team sports", "running and changing direction", "cycling or swimming"],
    },
    "place": {
        "5-7": ["going to school", "staying at school without a parent"],
        "8-10": ["going to school", "staying at a relative's house or a friend's house"],
        "11-12": ["going to school", "going to tuition or classes"],
    },
}

SCALE_FREQ = "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often"
SCALE_IMPACT = "1=Not at all|2=A little|3=Somewhat|4=Quite a lot|5=A great deal"

DOMAIN_LABEL = {
    "attention_work": "attention, concentration and work habits",
    "listening_speaking": "listening, understanding and speaking",
    "reading": "reading",
    "writing": "writing and spelling",
    "numbers": "maths and number work",
    "motor": "movement, coordination and fine motor skills",
    "social": "friendships and getting along with other children",
    "emotion_school": "feelings, behaviour and adjustment to school",
}
