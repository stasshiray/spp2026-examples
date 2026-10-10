import { useEffect, useState } from "react";
import { describeApiError, fetchLikes, sendSwipe, type IncomingLike } from "../lib/api";
import { PersonActions } from "./person-actions";

export function LikesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<IncomingLike[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await fetchLikes(token);

        if (!cancelled) {
          setItems(page.items);
          setError(null);
        }
      } catch (reason: unknown) {
        if (!cancelled) {
          setError(describeApiError(reason));
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function likeBack(item: IncomingLike) {
    setPending(true);
    setError(null);

    try {
      await sendSwipe(token, { kind: "like", targetId: item.card.id });
      setItems((current) => current?.filter((row) => row.card.id !== item.card.id) ?? null);
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="stack">
      {error ? <p className="status error">{error}</p> : null}
      {!items && !error ? <p className="status">Смотрим, кто лайкнул…</p> : null}
      {items?.length === 0 ? <p className="status">Пока никто не лайкнул.</p> : null}
      {items?.map((item) => (
        <article className="card" key={item.card.id}>
          <p className="meta">{item.kind === "superlike" ? "Суперлайк" : "Лайк"}</p>
          <h2>
            {item.card.name}, {item.card.age}
          </h2>
          <p className="bio">{item.card.city}</p>
          {item.note ? <p className="bio">Заметка: {item.note}</p> : null}
          <button
            type="button"
            className="like"
            disabled={pending}
            onClick={() => void likeBack(item)}
          >
            Лайкнуть в ответ
          </button>
          <PersonActions
            token={token}
            profileId={item.card.id}
            onBlocked={() =>
              setItems((current) => current?.filter((row) => row.card.id !== item.card.id) ?? null)
            }
          />
        </article>
      ))}
    </section>
  );
}
