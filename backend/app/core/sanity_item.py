from .session import ScreeningSession

HONEYPOT_ITEM_ID = "sanity_hidden_01"

def check_sanity(session: ScreeningSession) -> bool:
    """
    Check if the honeypot sanity item is present in the session's answers.
    Since it is a fixed hidden item never surfaced to a legitimate caregiver, 
    its presence indicates bot or automated scraper activity.
    
    Returns True if sane (valid), False if insane (invalid/bot).
    """
    return HONEYPOT_ITEM_ID not in session.answers
