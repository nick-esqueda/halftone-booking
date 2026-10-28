import { describe, expect, it } from "vitest";

import {
  addExchange,
  buildDefaultsFromDraft,
  findReplyAction,
  MAX_HISTORY_ENTRIES,
} from "./assistantConversation";

describe("addExchange", () => {
  it("adds the question and the answer", () => {
    expect(addExchange([], "Camera A Friday", "Which time?")).toEqual([
      { role: "user", text: "Camera A Friday" },
      { role: "assistant", text: "Which time?" },
    ]);
  });

  it("keeps only the most recent entries", () => {
    let history = addExchange([], "first", "reply");
    for (let round = 0; round < MAX_HISTORY_ENTRIES; round += 1) {
      history = addExchange(history, `question ${round}`, `answer ${round}`);
    }

    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history.at(-1)).toEqual({ role: "assistant", text: "answer 9" });
    expect(history).not.toContainEqual({ role: "user", text: "first" });
  });
});

describe("buildDefaultsFromDraft", () => {
  it("fills the form in studio time, including the purpose", () => {
    const draft = {
      equipment_ids: [1, 4],
      starts_at: "2026-10-29T18:00:00Z",
      ends_at: "2026-10-29T20:30:00Z",
      purpose: "Podcast",
    };

    expect(buildDefaultsFromDraft(draft, "Sam K", "America/Chicago")).toEqual({
      bookerName: "Sam K",
      purpose: "Podcast",
      startDate: "2026-10-29",
      startTime: "13:00",
      endDate: "2026-10-29",
      endTime: "15:30",
      equipmentIds: [1, 4],
    });
  });
});

describe("findReplyAction", () => {
  const draft = {
    equipment_ids: [1],
    starts_at: "2026-10-29T18:00:00Z",
    ends_at: "2026-10-29T20:00:00Z",
    purpose: "",
  };
  const base = { message: "Hi", draft: null, options: [] };

  it("opens a new booking for a draft", () => {
    expect(findReplyAction({ ...base, kind: "draft", draft })).toEqual({
      label: "Review the draft",
      target: { kind: "draft", draft },
    });
  });

  it("opens the booking with the change for a change", () => {
    const reply = { ...base, kind: "change" as const, draft, booking_id: 7 };

    expect(findReplyAction(reply)).toEqual({
      label: "Review the change",
      target: {
        kind: "booking",
        bookingId: 7,
        suggestion: { kind: "change", draft },
        startsAt: draft.starts_at,
      },
    });
  });

  it("opens the booking to confirm a cancellation", () => {
    const reply = {
      ...base,
      kind: "cancel" as const,
      original: draft,
      booking_id: 7,
    };

    expect(findReplyAction(reply)?.target).toEqual({
      kind: "booking",
      bookingId: 7,
      suggestion: { kind: "cancel" },
      startsAt: draft.starts_at,
    });
  });

  it("opens nothing for questions and messages", () => {
    expect(findReplyAction({ ...base, kind: "question" })).toBeNull();
    expect(findReplyAction({ ...base, kind: "message" })).toBeNull();
  });
});
