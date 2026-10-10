import { Link } from "react-router";
import { useEffect, useRef, useState } from "react";
import { describeApiError, type ChatMessage, type MatchItem } from "../lib/api";
import { openChat, type ChatConnection, type ChatHistory } from "../lib/chat";

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((left, right) => left.id - right.id);
}

export function ChatPanel({ match }: { match: MatchItem }) {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [partnerRead, setPartnerRead] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const opened = useRef(false);
  const outgoing = useRef<string | null>(null);
  const chatRef = useRef<ChatConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    opened.current = false;

    function mark(chat: ChatConnection, messageId: number) {
      try {
        chat.markRead(messageId);
      } catch {
        // The socket can drop between a frame and the read cursor.
      }
    }

    function noteOwn(message: ChatMessage) {
      if (message.authorId === match.profile.id || outgoing.current === null) {
        return;
      }

      if (message.body !== outgoing.current) {
        return;
      }

      outgoing.current = null;
      setDraft((current) => (current.trim() === message.body ? "" : current));
      setPending(false);
    }

    function applyHistory(chat: ChatConnection, page: ChatHistory) {
      if (cancelled) {
        return;
      }

      setItems((current) => mergeMessages(current, page.items));
      setLive(true);

      if (page.cursor !== null) {
        setCursor(page.nextCursor);

        return;
      }

      setError(null);

      if (!opened.current) {
        opened.current = true;
        setCursor(page.nextCursor);

        if (page.items.length === 0 && match.note) {
          setDraft(match.note);
        }
      }

      const newest = page.items[page.items.length - 1];

      if (newest) {
        mark(chat, newest.id);
      }
    }

    const chat = openChat(match.id, {
      onHistory(page) {
        applyHistory(chat, page);
      },
      onMessage(message) {
        if (cancelled) {
          return;
        }

        setItems((current) => mergeMessages(current, [message]));
        noteOwn(message);
        mark(chat, message.id);
      },
      onRead(read) {
        if (cancelled || read.profileId !== match.profile.id) {
          return;
        }

        setPartnerRead((current) =>
          current === null || read.lastReadMessageId > current ? read.lastReadMessageId : current,
        );
      },
      onError(reason) {
        if (cancelled) {
          return;
        }

        outgoing.current = null;
        setPending(false);
        setError(describeApiError(reason));
      },
    });
    chatRef.current = chat;

    return () => {
      cancelled = true;
      chat.close();
      chatRef.current = null;
    };
  }, [match.id, match.note, match.profile.id]);

  function earlier() {
    const chat = chatRef.current;

    if (cursor === null || !chat) {
      return;
    }

    try {
      chat.loadEarlier(cursor);
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    }
  }

  function submit() {
    const text = draft.trim();
    const chat = chatRef.current;

    if (text === "" || pending || !chat) {
      return;
    }

    setPending(true);
    setError(null);
    outgoing.current = text;

    try {
      chat.send(text, crypto.randomUUID());
    } catch (reason: unknown) {
      outgoing.current = null;
      setPending(false);
      setError(describeApiError(reason));
    }
  }

  return (
    <section className="stack">
      <Link to="/matches" className="skip link-button">
        К парам
      </Link>
      <h2>
        {match.profile.name}, {match.profile.age}
      </h2>
      {cursor !== null ? (
        <button type="button" className="skip" onClick={earlier}>
          Более ранние
        </button>
      ) : null}
      {!live && !error ? <p className="status">Подключаемся…</p> : null}
      <div className="thread">
        {items.map((message) => {
          const mine = message.authorId !== match.profile.id;
          const read = mine && partnerRead !== null && message.id <= partnerRead;

          return (
            <p key={message.id} className={mine ? "bubble mine" : "bubble"}>
              {message.body}
              {read ? (
                <span className="tick" role="img" aria-label="Прочитано">
                  ✓
                </span>
              ) : null}
            </p>
          );
        })}
      </div>
      {error ? <p className="status error">{error}</p> : null}
      <label className="note">
        <span>Сообщение</span>
        <input value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="button" className="like" disabled={!live || pending} onClick={submit}>
        Отправить
      </button>
    </section>
  );
}
