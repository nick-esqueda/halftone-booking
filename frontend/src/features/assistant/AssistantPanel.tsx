import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AssistantReply, Booking } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { TEXT_INPUT_CLASS_NAME } from "../../components/ui/styles";
import { useBookerNameContext } from "../identity/bookerNameStore";
import {
  addExchange,
  describeConfirmed,
  findReplyAction,
  toHistory,
  type ConversationEntry,
  type ReplyTarget,
} from "./assistantConversation";
import { useAskAssistant } from "./useAskAssistant";

// Matches the API's limit on one message.
const MAX_MESSAGE_LENGTH = 500;
const PLACEHOLDER = 'e.g. "Camera A and a light Thursday after lunch"';

interface AssistantPanelProps {
  timezone: string;
  /**
   * Opens a draft or a suggested change in a booking form, for review.
   * `onConfirmed` gets the booking once the person saves or cancels it there.
   */
  onOpen: (
    target: ReplyTarget,
    onConfirmed: (booking: Booking) => void,
  ) => void;
}

/**
 * Ask for a booking, a change or a cancellation in plain English. The
 * assistant replies with a suggestion (which opens the booking form), a
 * question with times to pick, or a note. Nothing is saved or cancelled
 * until the person confirms in the booking form.
 */
export function AssistantPanel({ timezone, onOpen }: AssistantPanelProps) {
  const { bookerName } = useBookerNameContext();
  const askAssistant = useAskAssistant();
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [lastReply, setLastReply] = useState<AssistantReply | null>(null);

  // Once confirmed, the suggestion is done: drop its button and record what
  // was saved in the conversation.
  const openTarget = (target: ReplyTarget) => {
    onOpen(target, (booking) => {
      setLastReply(null);
      const text = describeConfirmed(target, booking, timezone);
      setConversation((earlier) => [...earlier, { role: "confirmed", text }]);
    });
  };

  const showReply = (question: string, reply: AssistantReply) => {
    setConversation((earlier) =>
      addExchange(earlier, question, reply.message, bookerName),
    );
    setLastReply(reply);
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
    const history = toHistory(conversation);
    const request = { message: question, booker_name: bookerName, history };
    askAssistant.mutate(request, {
      onSuccess: (reply) => showReply(question, reply),
    });
  };

  const startOver = () => {
    setConversation([]);
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
        {conversation.length > 0 && (
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
      {conversation.length > 0 && <Conversation entries={conversation} />}
      {lastReply && <ReplyActions reply={lastReply} onOpen={openTarget} />}
      {askAssistant.error && (
        <ErrorBanner title="The assistant couldn't answer.">
          <p className="text-ink-muted">{askAssistant.error.message}</p>
        </ErrorBanner>
      )}
    </section>
  );
}

// Shown when a question was sent without a "Booking as" name.
const UNNAMED_SPEAKER = "You";

interface NoteStyle {
  prefix: string;
  className: string;
}

// Lines from the app rather than a speaker, and how each kind looks.
const NOTE_STYLES: Partial<Record<ConversationEntry["role"], NoteStyle>> = {
  confirmed: { prefix: "✓ ", className: "font-medium text-success" },
  switched: {
    prefix: "",
    className: "block border-t border-line pt-1 text-xs text-ink-muted",
  },
};

/** The conversation, scrolling once it's taller than its box. */
function Conversation({ entries }: { entries: ConversationEntry[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the newest line in view as lines are added.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries.length]);

  return (
    <ol
      ref={listRef}
      aria-label="Conversation"
      tabIndex={0}
      className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm"
    >
      {entries.map((entry, index) => (
        <li key={index}>
          <ConversationLine entry={entry} />
        </li>
      ))}
    </ol>
  );
}

function ConversationLine({ entry }: { entry: ConversationEntry }) {
  const note = NOTE_STYLES[entry.role];
  if (note) {
    return (
      <span className={note.className}>
        {note.prefix}
        {entry.text}
      </span>
    );
  }
  const speaker =
    entry.role === "user" ? entry.bookerName || UNNAMED_SPEAKER : "Assistant";
  return (
    <>
      <span className="font-semibold">{speaker}:</span>{" "}
      <span className="text-ink-muted">{entry.text}</span>
    </>
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
