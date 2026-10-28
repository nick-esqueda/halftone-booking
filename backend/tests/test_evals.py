"""The eval runner and grader, checked with a scripted model (no real model).

The evals themselves run against the real model in their own workflow.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.config import get_settings
from app.schemas import AssistantReply, DraftBooking, DraftOption
from evals.grading import CHECKS, EquipmentInfo, GradingContext, grade
from evals.run_evals import load_cases, run_case
from tests.scripted_model import ScriptedModel, call_tools, provider_down, say

ZONE = ZoneInfo("America/Chicago")
EQUIPMENT = {
    1: EquipmentInfo("Camera A", "camera"),
    2: EquipmentInfo("Camera B", "camera"),
    4: EquipmentInfo("Lighting Kit 1", "lighting"),
}


def at(day: int, hour: int) -> datetime:
    return datetime(2026, 10, day, hour, tzinfo=ZONE)


def draft_reply(
    equipment_ids: list[int], start: datetime, end: datetime
) -> AssistantReply:
    draft = DraftBooking(
        equipment_ids=equipment_ids, starts_at=start, ends_at=end, purpose="Podcast"
    )
    return AssistantReply(kind="draft", message="Here you go.", draft=draft)


def grade_reply(reply: AssistantReply, **expect: object) -> list[str]:
    return grade(expect, GradingContext(reply, EQUIPMENT, ZONE))


def test_a_matching_draft_passes() -> None:
    reply = draft_reply([1, 4], at(29, 13), at(29, 15))

    problems = grade_reply(
        reply,
        kind="draft",
        equipment=["Camera A", "Lighting Kit 1"],
        categories={"camera": 1, "lighting": 1},
        starts_at="2026-10-29T13:00",
        ends_at="2026-10-29T15:00",
        purpose_contains="podcast",
    )

    assert problems == []


def test_a_wrong_draft_lists_each_problem() -> None:
    reply = draft_reply([2], at(29, 14), at(29, 15))

    problems = grade_reply(
        reply,
        equipment=["Camera A"],
        excluded_equipment=["Camera B"],
        starts_at="2026-10-29T13:00",
    )

    assert problems == [
        "items were ['Camera B'], expected ['Camera A']",
        "used ['Camera B'], which should be avoided",
        "started at 2026-10-29T14:00",
    ]


def test_a_question_is_graded_on_its_options() -> None:
    option = DraftOption(
        label="Fri",
        equipment_ids=[2],
        starts_at=at(30, 9),
        ends_at=at(30, 12),
        purpose="",
    )
    reply = AssistantReply(kind="question", message="Which?", options=[option])

    assert grade_reply(reply, kind=["question", "message"], min_options=1) == []
    assert grade_reply(reply, options_date="2026-10-29") == [
        "options on other days: ['2026-10-30']"
    ]
    assert grade_reply(reply, starts_at="2026-10-30T09:00") == ["no draft to check"]


def test_unknown_expect_fields_are_an_error() -> None:
    with pytest.raises(ValueError, match="kindd"):
        grade_reply(draft_reply([1], at(29, 13), at(29, 15)), kindd="draft")


def test_every_case_uses_known_fields() -> None:
    for case in load_cases(None):
        assert set(case["expect"]) <= set(CHECKS), case["name"]
        assert case["message"].strip(), case["name"]


def test_a_case_runs_end_to_end_with_its_bookings(model: ScriptedModel) -> None:
    [case] = load_cases("any camera skips the taken one")
    model.will_reply(
        call_tools(
            (
                "propose_booking",
                {
                    "equipment_ids": [1],
                    "starts_at": "2026-10-29T13:00",
                    "ends_at": "2026-10-29T15:00",
                    "purpose": "",
                    "message": "Camera A it is.",
                },
            )
        ),
        say("Camera A is taken, so I'll ask."),
    )

    result = run_case(case, model, get_settings())

    # Camera A is booked in this case, so the draft is refused and the
    # model's fallback text fails the "draft" expectation.
    assert model.outcomes_sent_back()[0].is_error
    assert not result.passed
    assert "kind was 'message', expected draft" in result.problems


def test_a_provider_error_is_tried_again(model: ScriptedModel) -> None:
    [case] = load_cases("off topic")
    model.will_reply(provider_down(), say("I can only help book equipment."))

    result = run_case(case, model, get_settings())

    assert result.passed
    assert len(model.requests) == 2


def test_a_provider_error_twice_fails_the_case(model: ScriptedModel) -> None:
    [case] = load_cases("off topic")
    model.will_reply(provider_down(), provider_down())

    result = run_case(case, model, get_settings())

    assert result.problems == ["provider error: Couldn't reach the provider."]
