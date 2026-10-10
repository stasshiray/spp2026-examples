import { Link } from "react-router";
import { useEffect, useState } from "react";
import { closeMatch, describeApiError, fetchMatches, type MatchItem } from "../lib/api";

export function MatchesPanel({ token }: { token: string }) {
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await fetchMatches(token);

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

  async function unmatch(matchId: number) {
    setError(null);

    try {
      await closeMatch(token, matchId);
      setItems((current) => current?.filter((item) => item.id !== matchId) ?? null);
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    }
  }

  return (
    <section className="stack">
      {error ? <p className="status error">{error}</p> : null}
      {!items && !error ? <p className="status">Собираем пары…</p> : null}
      {items?.length === 0 ? <p className="status">Пока нет открытых пар.</p> : null}
      {items?.map((item) => (
        <article className="card" key={item.id}>
          <p className="meta">{item.status === "pending" ? "Ждёт сообщения" : "Активна"}</p>
          <h2>
            {item.profile.name}, {item.profile.age}
          </h2>
          <p className="bio">{item.profile.city}</p>
          {item.note ? <p className="bio">Заметка суперлайка: {item.note}</p> : null}
          <div className="actions two">
            <Link to={`/matches/${item.id}`} className="like link-button">
              Написать
            </Link>
            <button type="button" className="skip" onClick={() => void unmatch(item.id)}>
              Закрыть пару
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
