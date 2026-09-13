from data.generator.item_bank import Item

from .session import ScreeningSession


def evaluate_motor_confounds(
    session: ScreeningSession, item_bank: list[Item]
) -> list[str]:
    """
    Evaluate if failures in non-motor domains might actually be due to a motor
    confound (e.g., poor hand coordination) rather than a true developmental
    delay in that domain.
    """
    caveats = []

    # Quick lookup for items
    item_by_id = {item.item_id: item for item in item_bank}

    # Group answered items by domain
    answered_by_domain = {}
    for item_id, answer in session.answers.items():
        if item_id in item_by_id:
            domain = item_by_id[item_id].domain
            if domain not in answered_by_domain:
                answered_by_domain[domain] = []
            answered_by_domain[domain].append((item_by_id[item_id], answer))

    for domain, items_and_answers in answered_by_domain.items():
        if domain in ("gross_motor", "fine_motor"):
            continue

        failed_motor_confound = []
        passed_pure = []

        for item, answer in items_and_answers:
            if item.motor_confound:
                if answer == 0:
                    failed_motor_confound.append(item)
            else:
                if answer > 0:
                    passed_pure.append(item)

        if failed_motor_confound and passed_pure:
            item_ids = [i.item_id for i in failed_motor_confound]
            caveats.append(
                f"Low score on {', '.join(item_ids)} ({domain}) may be a motor confound, "
                f"as the child passed other {domain} items without a motor component."
            )

    return caveats
