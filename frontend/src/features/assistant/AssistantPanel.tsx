import { useState, type FormEvent } from "react";

import type {
  AssistantHistoryEntry,
  AssistantReply,
  DraftBooking,
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { useBookerNameContext } from "../identity/bookerNameStore";
import { addExchange } from "./assistantConversation";
import { useAskAssistant } from "./useAskAssistant";

// Matches the API's limit on one message.
const MAX_MESSAGE_LENGTH = 500;
const PLACEHOLDER = 'e.g. "Camera A and a light Thursday after lunch"';

interface AssistantPanelProps {
  /** Opens the booking form filled in from a draft, for the person to review. */
  onOpenDraft: (draft: DraftBooking) => void;
}

/**
 * Ask for a booking in plain English. The assistant replies with a draft
 * (which opens the booking form), a question with times to pick, or a note.
 * Nothing is saved until the person confirms in the booking form.
 */
export function AssistantPanel({ onOpenDraft }: AssistantPanelProps) {
  const { bookerName } = useBookerNameContext();
  const askAssistant = useAskAssistant();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<AssistantHistoryEntry[]>([]);
  const [lastReply, setLastReply] = useState<AssistantReply | null>(null);

  const showReply = (question: string, reply: AssistantReply) => {
    setHistory((earlier) => addExchange(earlier, question, reply.message));
    setLastReply(reply);
    setMessage("");
    if (reply.draft) {
      onOpenDraft(reply.draft);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = message.trim();
    if (question === "" || askAssistant.isPending) {
      return;
    }
    const request = { message: question, booker_name: bookerName, history };
    askAssistant.mutate(request, {
      onSuccess: (reply) => showReply(question, reply),
    });
  };

  const startOver = () => {
    setHistory([]);
    setLastReply(null);
    askAssistant.reset();
  };

  return (
    <section
      aria-label="Booking assistant"
      className="space-y-3 rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Ask for a booking</h2>
        {history.length > 0 && (
          <Button variant="ghost" onClick={startOver}>
            Start over
          </Button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <label htmlFor="assistant-message" className="sr-only">
          Ask the booking assistant
        </label>
        <input
          id="assistant-message"
          value={message}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={PLACEHOLDER}
          onChange={(event) => setMessage(event.target.value)}
          className={`${TEXT_INPUT_CLASS_NAME} min-w-0 flex-1`}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={askAssistant.isPending || message.trim() === ""}
        >
          {askAssistant.isPending ? "Thinking…" : "Ask"}
        </Button>
      </form>
      {history.length > 0 && <Conversation history={history} />}
      {lastReply && (
        <ReplyActions reply={lastReply} onOpenDraft={onOpenDraft} />
      )}
      {askAssistant.error && (
        <ErrorBanner title="The assistant couldn't answer.">
          <p className="text-ink-muted">{askAssistant.error.message}</p>
        </ErrorBanner>
      )}
    </section>
  );
}

const SPEAKER_NAMES: Record<AssistantHistoryEntry["role"], string> = {
  user: "You",
  assistant: "Assistant",
};

function Conversation({ history }: { history: AssistantHistoryEntry[] }) {
  return (
    <ol aria-label="Conversation" className="space-y-1 text-sm">
      {history.map((entry, index) => (
        <li key={index}>
          <span className="font-semibold">{SPEAKER_NAMES[entry.role]}:</span>{" "}
          <span className="text-ink-muted">{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}

interface ReplyActionsProps {
  reply: AssistantReply;
  onOpenDraft: (draft: DraftBooking) => void;
}

/** What the person can do next: pick a suggested time, or reopen the draft. */
function ReplyActions({ reply, onOpenDraft }: ReplyActionsProps) {
  const draft = reply.draft;
  if (draft) {
    return <Button onClick={() => onOpenDraft(draft)}>Review the draft</Button>;
  }
  if (reply.options.length === 0) {
    return null;
  }
  return (
    <div
      role="group"
      aria-label="Suggested times"
      className="flex flex-wrap gap-2"
    >
      {reply.options.map((option) => (
        <Button key={option.label} onClick={() => onOpenDraft(option)}>
          {option.label}
        </Button>
      ))}
    </div>
  );
}
