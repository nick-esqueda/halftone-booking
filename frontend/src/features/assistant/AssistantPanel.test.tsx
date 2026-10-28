import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AssistantReply } from "../../api/types";
import { installFakeApi, respond } from "../../test/fakeApi";
import { renderWithProviders } from "../../test/renderWithProviders";
import { readTime } from "../../test/timePicker";
import { SchedulePage } from "../../pages/SchedulePage";
import { useBookerNameContext } from "../identity/bookerNameStore";
import { NameInput } from "../identity/NameInput";

const CAMERA_A = {
  id: 1,
  name: "Camera A",
  category: "camera",
  description: "",
};
const CONFIG = {
  timezone: "America/Chicago",
  time_step_minutes: 15,
  assistant_enabled: true,
};
const AVAILABILITY = {
  equipment: [{ equipment: CAMERA_A, is_free: true, busy: [] }],
};

const DRAFT_REPLY: AssistantReply = {
  kind: "draft",
  message: "Here's Camera A for Thursday afternoon.",
  draft: {
    equipment_ids: [CAMERA_A.id],
    starts_at: "2026-10-29T13:00:00-05:00",
    ends_at: "2026-10-29T15:00:00-05:00",
    purpose: "Interview",
  },
  options: [],
};
// What the server saved from DRAFT_REPLY, after the purpose was edited.
const SAVED_BOOKING = {
  id: 1,
  booker_name: "Sam K",
  purpose: "Interview with Ana",
  starts_at: DRAFT_REPLY.draft!.starts_at,
  ends_at: DRAFT_REPLY.draft!.ends_at,
  is_cancelled: false,
  version: 1,
  items: [{ equipment_id: CAMERA_A.id, equipment_name: "Camera A" }],
};
const QUESTION_REPLY: AssistantReply = {
  kind: "question",
  message: "Camera A is free at these times on Friday. Which one?",
  draft: null,
  options: [
    {
      label: "Fri Oct 30, 9:00 AM – 12:00 PM",
      equipment_ids: [CAMERA_A.id],
      starts_at: "2026-10-30T09:00:00-05:00",
      ends_at: "2026-10-30T12:00:00-05:00",
      purpose: "Shoot",
    },
    {
      label: "Fri Oct 30, 2:00 PM – 6:00 PM",
      equipment_ids: [CAMERA_A.id],
      starts_at: "2026-10-30T14:00:00-05:00",
      ends_at: "2026-10-30T18:00:00-05:00",
      purpose: "Shoot",
    },
  ],
};
const MESSAGE_REPLY: AssistantReply = {
  kind: "message",
  message: "What time on Thursday?",
  draft: null,
  options: [],
};
const PROVIDER_DOWN = {
  code: "assistant_unavailable",
  message: "The booking assistant can't be reached right now.",
  conflicts: [],
};

function installApi(assistantReply: () => Response, assistantEnabled = true) {
  return installFakeApi({
    "GET /api/config": () =>
      respond(200, { ...CONFIG, assistant_enabled: assistantEnabled }),
    "GET /api/availability": () => respond(200, AVAILABILITY),
    "GET /api/booker-names": () => respond(200, []),
    "POST /api/assistant/draft": assistantReply,
    "POST /api/bookings": () => respond(201, SAVED_BOOKING),
  });
}

async function ask(message: string) {
  const input = await screen.findByLabelText("Ask the booking assistant");
  await userEvent.clear(input);
  await userEvent.type(input, message);
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
}

/** The "Booking as" field, as the app header shows it. */
function BookingAsField() {
  const { bookerName, setBookerName } = useBookerNameContext();
  return (
    <NameInput label="Booking as" value={bookerName} onChange={setBookerName} />
  );
}

async function bookAs(name: string) {
  const field = screen.getByLabelText("Booking as");
  await userEvent.clear(field);
  await userEvent.type(field, name);
}

describe("AssistantPanel", () => {
  it("is hidden when the server has no assistant", async () => {
    installApi(() => respond(200, DRAFT_REPLY), false);
    renderWithProviders(<SchedulePage />);

    expect(await screen.findByTestId("row-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Booking assistant" }),
    ).not.toBeInTheDocument();
  });

  it("opens the booking form filled in from a draft, without saving", async () => {
    const api = installApi(() => respond(200, DRAFT_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A Thursday 1 to 3 for an interview");

    const dialog = await screen.findByRole("dialog", { name: "New booking" });
    expect(within(dialog).getByLabelText("Start date")).toHaveValue(
      "2026-10-29",
    );
    expect(readTime("Start time")).toBe("1:00 PM");
    expect(readTime("End time")).toBe("3:00 PM");
    expect(within(dialog).getByLabelText("Purpose")).toHaveValue("Interview");
    expect(
      within(dialog).getByRole("checkbox", { name: /Camera A/ }),
    ).toBeChecked();
    expect(api.requests("POST /api/assistant/draft")).toEqual([
      {
        message: "Camera A Thursday 1 to 3 for an interview",
        booker_name: "",
        history: [],
      },
    ]);
  });

  it("records what was booked in the conversation, and drops the button", async () => {
    const api = installApi(() => respond(200, DRAFT_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A Thursday 1 to 3 for an interview");
    const dialog = await screen.findByRole("dialog", { name: "New booking" });
    await userEvent.type(within(dialog).getByLabelText("Booked by"), "Sam K");
    const purpose = within(dialog).getByLabelText("Purpose");
    await userEvent.clear(purpose);
    await userEvent.type(purpose, "Interview with Ana");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Book 1 item" }),
    );

    const conversation = screen.getByRole("list", { name: "Conversation" });
    expect(
      await within(conversation).findByText(
        "✓ Booked: Camera A, Thu 29 Oct, 1:00 PM – 3:00 PM (Interview with Ana)",
      ),
    ).toBeInTheDocument();
    expect(api.requests("POST /api/bookings")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Review the draft" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the booked line after a follow-up, without sending it", async () => {
    const api = installApi(() => respond(200, DRAFT_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A Thursday 1 to 3 for an interview");
    const dialog = await screen.findByRole("dialog", { name: "New booking" });
    await userEvent.type(within(dialog).getByLabelText("Booked by"), "Sam K");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Book 1 item" }),
    );
    await screen.findByText(/^✓ Booked:/);
    api.setRoute("POST /api/assistant/draft", () =>
      respond(200, MESSAGE_REPLY),
    );
    await ask("And a light?");
    await screen.findByText(MESSAGE_REPLY.message);

    expect(screen.getByText(/^✓ Booked:/)).toBeInTheDocument();
    const [, followUp] = api.requests("POST /api/assistant/draft");
    expect(followUp).toMatchObject({
      history: [
        { role: "user", text: "Camera A Thursday 1 to 3 for an interview" },
        { role: "assistant", text: DRAFT_REPLY.message },
      ],
    });
  });

  it("offers suggested times and opens the one picked", async () => {
    installApi(() => respond(200, QUESTION_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A for Friday's shoot");

    expect(await screen.findByText(QUESTION_REPLY.message)).toBeInTheDocument();
    const suggestions = screen.getByRole("group", { name: "Suggested times" });
    await userEvent.click(
      within(suggestions).getByRole("button", {
        name: "Fri Oct 30, 2:00 PM – 6:00 PM",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New booking" });
    expect(within(dialog).getByLabelText("Start date")).toHaveValue(
      "2026-10-30",
    );
    expect(readTime("Start time")).toBe("2:00 PM");
    expect(within(dialog).getByLabelText("Purpose")).toHaveValue("Shoot");
  });

  it("sends the conversation so far with a follow-up", async () => {
    const api = installApi(() => respond(200, QUESTION_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A for Friday's shoot");
    await screen.findByText(QUESTION_REPLY.message);
    await ask("The morning one");

    const [, followUp] = api.requests("POST /api/assistant/draft");
    expect(followUp).toEqual({
      message: "The morning one",
      booker_name: "",
      history: [
        { role: "user", text: "Camera A for Friday's shoot" },
        { role: "assistant", text: QUESTION_REPLY.message },
      ],
    });
  });

  it("labels questions with the name they were sent under", async () => {
    installApi(() => respond(200, MESSAGE_REPLY));
    renderWithProviders(
      <>
        <BookingAsField />
        <SchedulePage />
      </>,
    );

    await bookAs("Sam K");
    await ask("Camera A Thursday");
    await screen.findByText(MESSAGE_REPLY.message);
    await bookAs("Ana");
    await ask("Camera B Thursday");
    await screen.findByText("Camera B Thursday");

    const lines = within(
      screen.getByRole("list", { name: "Conversation" }),
    ).getAllByRole("listitem");
    expect(lines.map((line) => line.textContent)).toEqual([
      "Sam K: Camera A Thursday",
      `Assistant: ${MESSAGE_REPLY.message}`,
      "Now booking as Ana",
      "Ana: Camera B Thursday",
      `Assistant: ${MESSAGE_REPLY.message}`,
    ]);
  });

  it("starts over with an empty conversation", async () => {
    const api = installApi(() => respond(200, QUESTION_REPLY));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A for Friday's shoot");
    await userEvent.click(
      await screen.findByRole("button", { name: "Start over" }),
    );
    api.setRoute("POST /api/assistant/draft", () =>
      respond(200, { ...MESSAGE_REPLY }),
    );
    await ask("Camera A Thursday");
    await screen.findByText(MESSAGE_REPLY.message);

    expect(screen.queryByText(QUESTION_REPLY.message)).not.toBeInTheDocument();
    const [, secondRequest] = api.requests("POST /api/assistant/draft");
    expect(secondRequest).toMatchObject({ history: [] });
  });

  it("explains when the assistant can't answer", async () => {
    installApi(() => respond(503, PROVIDER_DOWN));
    renderWithProviders(<SchedulePage />);

    await ask("Camera A Thursday");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The assistant couldn't answer.");
    expect(alert).toHaveTextContent("can't be reached right now");
  });
});
