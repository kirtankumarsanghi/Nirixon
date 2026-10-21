"""Seed a realistic demo ward (development only).

    cd backend
    python scripts/seed_demo_data.py --ward "Ward 12" --count 40

Adds pseudonymous children across triage tiers, age brackets and follow-up
dates so a fresh workspace has something to show. Idempotent: rows whose
pseudonymous id already exists are skipped. Refuses to run in production.

Demo *accounts* are created by the app on startup (see app/main.py); this script
only adds caseload records.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.db.models import ChildRecord
from app.db.session import get_session_factory, init_db
from sqlalchemy import select

AGE_BRACKETS = ["0-6m", "6-12m", "12-24m", "24-36m", "36-48m", "48-60m"]
TIERS = [
    "Tier 1: Typical",
    "Tier 1: Typical",
    "Tier 1: Typical",
    "Tier 2: In-App Reflex Monitor",
    "Tier 2: In-App Reflex Monitor",
    "Tier 3: Direct Referral",
    "Tier 3: Direct Referral",
    "Unscreened",
]


async def seed(ward: str, count: int) -> int:
    await init_db()
    factory = get_session_factory()
    now = datetime.now(UTC)
    slug = ward.replace(" ", "").lower()
    created = 0
    async with factory() as db:
        rows = await db.execute(
            select(ChildRecord.pseudonymous_id).where(
                ChildRecord.pseudonymous_id.like(f"demo-{slug}-%")
            )
        )
        existing = {r for (r,) in rows.all()}

        for i in range(count):
            pseudo = f"demo-{slug}-{i + 1:03d}"
            if pseudo in existing:
                continue
            tier = TIERS[i % len(TIERS)]
            screened = tier != "Unscreened"
            db.add(
                ChildRecord(
                    pseudonymous_id=pseudo,
                    age_bracket=AGE_BRACKETS[i % len(AGE_BRACKETS)],
                    village_ward=f"{ward} - Sector {'ABCD'[i % 4]}",
                    consent_given=True,
                    consent_recorded_at=now - timedelta(days=60),
                    opt_in=True,
                    current_tier=tier,
                    last_screened_at=(
                        now - timedelta(days=10 + i % 40) if screened else None
                    ),
                    last_contacted_at=(
                        now - timedelta(days=5 + i % 20) if screened else None
                    ),
                    follow_up_due_at=(
                        now - timedelta(days=3)
                        if tier.startswith("Tier 3") and i % 2 == 0
                        else now + timedelta(days=14 + i % 30)
                    ),
                    contact_count=(2 + i % 4) if screened else 0,
                    domains_flagged=(
                        ["gross_motor", "communication"]
                        if tier.startswith("Tier 3")
                        else []
                    ),
                    safety_rule_triggered=(
                        "Milestone regression reported"
                        if tier.startswith("Tier 3")
                        else None
                    ),
                )
            )
            created += 1
        await db.commit()
    return created


def main() -> None:
    settings = get_settings()
    if settings.environment.lower() in ("production", "prod"):
        raise SystemExit("Refusing to seed demo data when ENVIRONMENT=production.")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ward", default="Ward 12")
    parser.add_argument("--count", type=int, default=40)
    args = parser.parse_args()
    if not 1 <= args.count <= 1000:
        raise SystemExit("--count must be between 1 and 1000.")

    created = asyncio.run(seed(args.ward, args.count))
    print(f"Seeded {created} demo children in {args.ward}.")
    print(
        "Demo accounts are created by the app on startup (chw@example.com / changeme)."
    )


if __name__ == "__main__":
    main()
