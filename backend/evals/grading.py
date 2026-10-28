"""Grading one assistant reply against a case's `expect` block.

Pattern: a list of checks. Each check reads one `expect` field and returns a
problem (text) or None. A field a case leaves out isn't checked.

To grade something new: write a function with the `Check` signature, add it
to `CHECKS`, and describe the field in evals/README.md.
"""

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo

from app.schemas import AssistantReply, DraftBooking

WALL_CLOCK_FORMAT = "%Y-%m-%dT%H:%M"
DATE_FORMAT = "%Y-%m-%d"


@dataclass(frozen=True)
class EquipmentInfo:
    name: str
    category: str


@dataclass(frozen=True)
class GradingContext:
    reply: AssistantReply
    equipment_by_id: dict[int, EquipmentInfo]
    studio_zone: ZoneInfo

    def names_in(self, draft: DraftBooking) -> set[str]:
        return {self.equipment_by_id[item].name for item in draft.equipment_ids}

    def wall_clock(self, draft: DraftBooking) -> tuple[str, str]:
        starts_at = draft.starts_at.astimezone(self.studio_zone)
        ends_at = draft.ends_at.astimezone(self.studio_zone)
        return f"{starts_at:{WALL_CLOCK_FORMAT}}", f"{ends_at:{WALL_CLOCK_FORMAT}}"


Check = Callable[[Any, GradingContext], str | None]


def check_kind(expected: str | list[str], context: GradingContext) -> str | None:
    allowed = [expected] if isinstance(expected, str) else expected
    if context.reply.kind in allowed:
        return None
    return f"kind was {context.reply.kind!r}, expected {' or '.join(allowed)}"


def check_equipment(expected: list[str], context: GradingContext) -> str | None:
    return _check_draft(context, lambda draft: _same_names(expected, draft, context))


def _same_names(
    expected: list[str], draft: DraftBooking, context: GradingContext
) -> str | None:
    names = context.names_in(draft)
    if names == set(expected):
        return None
    return f"items were {sorted(names)}, expected {sorted(expected)}"


def check_equipment_includes(
    expected: list[str], context: GradingContext
) -> str | None:
    def find_missing(draft: DraftBooking) -> str | None:
        missing = set(expected) - context.names_in(draft)
        return f"items are missing {sorted(missing)}" if missing else None

    return _check_draft(context, find_missing)


def check_excluded_equipment(
    excluded: list[str], context: GradingContext
) -> str | None:
    drafts = _all_drafts(context.reply)
    used = set().union(*(context.names_in(draft) for draft in drafts))
    unwanted = used & set(excluded)
    return f"used {sorted(unwanted)}, which should be avoided" if unwanted else None


def check_categories(expected: dict[str, int], context: GradingContext) -> str | None:
    def compare(draft: DraftBooking) -> str | None:
        categories = [
            context.equipment_by_id[item].category for item in draft.equipment_ids
        ]
        counts = dict(Counter(categories))
        return None if counts == expected else f"categories were {counts}"

    return _check_draft(context, compare)


def check_starts_at(expected: str, context: GradingContext) -> str | None:
    def compare(draft: DraftBooking) -> str | None:
        starts_at, _ = context.wall_clock(draft)
        return None if starts_at == expected else f"started at {starts_at}"

    return _check_draft(context, compare)


def check_ends_at(expected: str, context: GradingContext) -> str | None:
    def compare(draft: DraftBooking) -> str | None:
        _, ends_at = context.wall_clock(draft)
        return None if ends_at == expected else f"ended at {ends_at}"

    return _check_draft(context, compare)


def check_purpose_contains(expected: str, context: GradingContext) -> str | None:
    def compare(draft: DraftBooking) -> str | None:
        if expected.lower() in draft.purpose.lower():
            return None
        return f"purpose was {draft.purpose!r}"

    return _check_draft(context, compare)


def check_min_options(expected: int, context: GradingContext) -> str | None:
    count = len(context.reply.options)
    return None if count >= expected else f"offered {count} options"


def check_options_date(expected: str, context: GradingContext) -> str | None:
    days = {
        f"{option.starts_at.astimezone(context.studio_zone):{DATE_FORMAT}}"
        for option in context.reply.options
    }
    wrong_days = days - {expected}
    return f"options on other days: {sorted(wrong_days)}" if wrong_days else None


def check_options_equipment(expected: list[str], context: GradingContext) -> str | None:
    for option in context.reply.options:
        problem = _same_names(expected, option, context)
        if problem is not None:
            return f"an option's {problem}"
    return None


def check_message_contains_any(
    expected: list[str], context: GradingContext
) -> str | None:
    message = context.reply.message.lower()
    if any(phrase.lower() in message for phrase in expected):
        return None
    return f"message mentions none of {expected}"


def check_message_excludes(unwanted: list[str], context: GradingContext) -> str | None:
    message = context.reply.message.lower()
    found = [phrase for phrase in unwanted if phrase.lower() in message]
    return f"message says {found}" if found else None


def check_booking_id(expected: int, context: GradingContext) -> str | None:
    booking_id = context.reply.booking_id
    return None if booking_id == expected else f"booking_id was {booking_id}"


# Each `expect` field and the check that grades it.
CHECKS: dict[str, Check] = {
    "kind": check_kind,
    "equipment": check_equipment,
    "equipment_includes": check_equipment_includes,
    "excluded_equipment": check_excluded_equipment,
    "categories": check_categories,
    "starts_at": check_starts_at,
    "ends_at": check_ends_at,
    "purpose_contains": check_purpose_contains,
    "min_options": check_min_options,
    "options_date": check_options_date,
    "options_equipment": check_options_equipment,
    "message_contains_any": check_message_contains_any,
    "message_excludes": check_message_excludes,
    "booking_id": check_booking_id,
}


def grade(expect: dict[str, Any], context: GradingContext) -> list[str]:
    """Every problem with the reply; an empty list means it passed."""
    unknown_fields = set(expect) - set(CHECKS)
    if unknown_fields:
        raise ValueError(f"Unknown expect fields: {sorted(unknown_fields)}")

    results = [CHECKS[field](value, context) for field, value in expect.items()]
    return [problem for problem in results if problem is not None]


def _check_draft(
    context: GradingContext, compare: Callable[[DraftBooking], str | None]
) -> str | None:
    draft = context.reply.draft
    if draft is None:
        return "no draft to check"
    return compare(draft)


def _all_drafts(reply: AssistantReply) -> list[DraftBooking]:
    drafts: list[DraftBooking] = list(reply.options)
    if reply.draft is not None:
        drafts.append(reply.draft)
    return drafts
