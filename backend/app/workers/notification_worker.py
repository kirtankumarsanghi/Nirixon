"""Single-process notification sweeper.

Run as its own container/service:

    python -m app.workers.notification_worker            # loop
    python -m app.workers.notification_worker --once     # one sweep (cron/tests)

Do not enable the in-API lifespan loop when running multiple API workers: each
worker would sweep independently and duplicate sends.
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from app.config import get_settings
from app.core.notifications.providers import get_notification_provider
from app.core.notifications.service import deliver_pending, schedule_due_reminders
from app.db.session import get_session_factory

logger = logging.getLogger(__name__)


async def run_once() -> dict[str, int]:
    factory = get_session_factory()
    async with factory() as session:
        scheduled = await schedule_due_reminders(session)
        await session.commit()
        provider = get_notification_provider(get_settings())
        counts = await deliver_pending(session, provider, limit=200)
        await session.commit()
    result = {"scheduled": scheduled, **counts}
    logger.info("notification sweep: %s", result)
    return result


async def main(*, once: bool = False) -> None:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            await run_once()
        except Exception:  # noqa: BLE001 - keep the worker alive
            logger.exception("notification sweep failed")
        if once:
            return
        await asyncio.sleep(max(30, settings.notification_sweep_seconds))


def cli() -> None:
    parser = argparse.ArgumentParser(description="Nirixon notification worker")
    parser.add_argument("--once", action="store_true", help="run one sweep and exit")
    args = parser.parse_args()
    asyncio.run(main(once=args.once))


if __name__ == "__main__":
    cli()
