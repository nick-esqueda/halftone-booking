import { useState, type FormEvent } from "react";

import type { AssistantHistoryEntry, AssistantReply } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { useBookerNameContext } from "../identity/bookerNameStore";
import {
  addExchange,
  describeConfirmed,
  findReplyAction,
  type ReplyTarget,
} from "./assistantConversation";
import { useAskAssistant } from "./useAskAssistant";

// Matches the API's limit on one message.
const MAX_MESSAGE_LENGTH = 500;
const PLACEHOLDER = 'e.g. "Camera A and a light Thursday after lunch"';

interface AssistantPanelProps {
  /**
   * Opens a draft or a suggested change in a booking form, for review.
   * `onConfirmed` runs once the person saves or cancels it there.
   */
  onOpen: (target: ReplyTarget, onConfirmed: () => void) => void;
}

/**
 * Ask for a booking, a change or a cancellation in plain English. The
 * assistant replies with a suggestion (which opens the booking form), a
 * question with times to pick, or a note. Nothing is saved or cancelled
 * until the person confirms in the booking form.
 */
export function AssistantPanel({ onOpen }: AssistantPanelProps) {
  const { bookerName } = useBookerNameContext();
  const askAssistant = useAskAssistant();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<AssistantHistoryEntry[]>([]);
  const [lastReply, setLastReply] = useState<AssistantReply | null>(null);
  const [confirmedNote, setConfirmedNote] = useState<string | null>(null);

  // Once confirmed, the suggestion is done: drop its button and say so.
  const openTarget = (target: ReplyTarget) => {
    onOpen(target, () => {
      setLastReply(null);
      setConfirmedNote(describeConfirmed(target));
    });
  };

  const showReply = (question: string, reply: AssistantReply) => {
    setHistory((earlier) => addExchange(earlier, question, reply.message));
    setLastReply(reply);
    setConfirmedNote(null);
    setMessage("");
    const action = findReplyAction(reply);
    if (action) {
      openTarget(action.target);
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
    setConfirmedNote(null);
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
      {lastReply && <ReplyActions reply={lastReply} onOpen={openTarget} />}
      {confirmedNote && (
        <p role="status" className="text-sm text-ink-muted">
          {confirmedNote}
        </p>
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
  onOpen: (target: ReplyTarget) => void;
}

/** What the person can do next: pick a suggested time, or reopen the suggestion. */
function ReplyActions({ reply, onOpen }: ReplyActionsProps) {
  const action = findReplyAction(reply);
  if (action) {
    return (
      <Button onClick={() => onOpen(action.target)}>{action.label}</Button>
    );
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
        <Button
          key={option.label}
          onClick={() => onOpen({ kind: "draft", draft: option })}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
