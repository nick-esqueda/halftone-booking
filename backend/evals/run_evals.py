"""Runs the assistant's eval set against the real model and reports a pass rate.

Each case starts from a clean database with the seeded equipment plus the
case's own bookings, with "now" fixed at Tue Oct 27 2026, 10:30 AM studio
time. The reply is graded by evals/grading.py.

This calls the real provider, so it costs money and needs ANTHROPIC_API_KEY.
It wipes the database at EVAL_DATABASE_URL (the test database by default).

Usage, from backend/:
    uv run python -m evals.run_evals
    uv run python -m evals.run_evals --case "weekend" --pass-rate 1
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

DEFAULT_EVAL_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/booking_test"
)
EVAL_DATABASE_URL = os.environ.get("EVAL_DATABASE_URL", DEFAULT_EVAL_DATABASE_URL)
os.environ["BOOKING_DATABASE_URL"] = EVAL_DATABASE_URL

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.assistant.assistant_service import AssistantService  # noqa: E402
from app.assistant.llm import LLMProvider, LLMUnavailableError  # noqa: E402
from app.assistant.providers import build_llm_provider  # noqa: E402
from app.assistant.tools import build_tool_context  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.db import get_engine, get_session_factory  # noqa: E402
from app.repositories.equipment_repository import EquipmentRepository  # noqa: E402
from app.schemas import AssistantReply, AssistantRequest, BookingRequest  # noqa: E402
from app.seed import seed_equipment  # noqa: E402
from app.services.booking_service import BookingService  # noqa: E402
from evals.grading import EquipmentInfo, GradingContext, grade  # noqa: E402

CASES_PATH = Path(__file__).with_name("cases.json")
ALL_TABLES = "booking_events, booking_items, bookings, equipment"
STUDIO_ZONE = ZoneInfo("America/Chicago")
EVAL_NOW = datetime(2026, 10, 27, 10, 30, tzinfo=STUDIO_ZONE)
DEFAULT_PASS_RATE = 0.9


class FixedClock:
    def now(self) -> datetime:
        return EVAL_NOW


@dataclass(frozen=True)
class CaseResult:
    name: str
    problems: list[str]
    reply: AssistantReply | None
    seconds: float

    @property
    def passed(self) -> bool:
        return not self.problems


def prepare_database() -> None:
    config = Config("alembic.ini")
    config.attributes["database_url"] = EVAL_DATABASE_URL
    command.upgrade(config, "head")


def reset_database(session: Session) -> None:
    session.execute(text(f"TRUNCATE {ALL_TABLES} RESTART IDENTITY CASCADE"))
    session.commit()
    seed_equipment(session)


def load_equipment(session: Session) -> dict[int, EquipmentInfo]:
    items = EquipmentRepository(session).list_active()
    return {item.id: EquipmentInfo(item.name, item.category) for item in items}


def add_bookings(
    session: Session, settings: Settings, bookings: list[dict[str, Any]]
) -> None:
    ids_by_name = {info.name: id for id, info in load_equipment(session).items()}
    service = BookingService(session, settings, FixedClock())
    for booking in bookings:
        equipment_ids = [ids_by_name[name] for name in booking["equipment"]]
        request = BookingRequest(
            booker_name=booking["booker_name"],
            purpose=booking.get("purpose", ""),
            equipment_ids=equipment_ids,
            starts_at=datetime.fromisoformat(booking["starts_at"]),
            ends_at=datetime.fromisoformat(booking["ends_at"]),
        )
        service.create_booking(request)


def build_request(case: dict[str, Any]) -> AssistantRequest:
    return AssistantRequest(
        message=case["message"],
        booker_name=case.get("booker_name", ""),
        history=case.get("history", []),
    )


def run_case(
    case: dict[str, Any], provider: LLMProvider, settings: Settings
) -> CaseResult:
    with get_session_factory()() as session:
        reset_database(session)
        add_bookings(session, settings, case.get("bookings", []))
        context = build_tool_context(session, settings, FixedClock())
        service = AssistantService(provider, context, settings)

        started = time.monotonic()
        try:
            reply = service.reply(build_request(case))
        except LLMUnavailableError as error:
            return CaseResult(case["name"], [f"provider error: {error}"], None, 0)
        seconds = time.monotonic() - started

        grading_context = GradingContext(reply, load_equipment(session), STUDIO_ZONE)
        problems = grade(case["expect"], grading_context)
    return CaseResult(case["name"], problems, reply, seconds)


def describe_reply(reply: AssistantReply | None) -> str:
    if reply is None:
        return "(no reply)"
    # A "|" would end the table cell early.
    message = reply.message.replace("|", "\\|")
    return f"{reply.kind}: {message}"


def build_report(results: list[CaseResult], pass_rate: float) -> str:
    passed_count = sum(result.passed for result in results)
    rate = passed_count / len(results)
    verdict = "PASSED" if rate >= pass_rate else "FAILED"
    rows = [
        f"| {'✅' if result.passed else '❌'} | {result.name} | "
        f"{'; '.join(result.problems) or '—'} | "
        f"{describe_reply(result.reply)} | {result.seconds:.1f}s |"
        for result in results
    ]
    header = [
        "## Assistant evals",
        "",
        f"**{verdict}**: {passed_count}/{len(results)} passed ({rate:.0%}), "
        f"threshold {pass_rate:.0%}.",
        "",
        "| | Case | Problems | Reply | Time |",
        "|---|---|---|---|---|",
    ]
    return "\n".join(header + rows) + "\n"


def write_report(report: str) -> None:
    print(report)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as summary:
            summary.write(report)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", help="Only run cases whose name contains this.")
    parser.add_argument(
        "--pass-rate",
        type=float,
        default=float(os.environ.get("EVAL_PASS_RATE", DEFAULT_PASS_RATE)),
        help="Share of cases that must pass, from 0 to 1.",
    )
    return parser.parse_args()


def load_cases(name_filter: str | None) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = json.loads(CASES_PATH.read_text())["cases"]
    if name_filter is None:
        return cases
    return [case for case in cases if name_filter in case["name"]]


def main() -> int:
    arguments = parse_arguments()
    settings = get_settings()
    provider = build_llm_provider(settings)
    if provider is None:
        print("No model is configured: set ANTHROPIC_API_KEY.", file=sys.stderr)
        return 2

    cases = load_cases(arguments.case)
    if not cases:
        print("No cases match.", file=sys.stderr)
        return 2

    prepare_database()
    results = []
    for case in cases:
        result = run_case(case, provider, settings)
        print(f"{'pass' if result.passed else 'FAIL'}  {result.name}", flush=True)
        results.append(result)

    write_report(build_report(results, arguments.pass_rate))
    get_engine().dispose()
    passed_count = sum(result.passed for result in results)
    return 0 if passed_count / len(results) >= arguments.pass_rate else 1


if __name__ == "__main__":
    sys.exit(main())
