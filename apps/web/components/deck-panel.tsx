import { useEffect, useState } from "react";
import {
  describeApiError,
  fetchCandidates,
  reasonLabel,
  sendSwipe,
  undoSwipe,
  type RankedCandidate,
  type SwipeKind,
} from "../lib/api";
import { PersonActions } from "./person-actions";

export function DeckPanel({ token }: { token: string }) {
  const [city, setCity] = useState("");
  const [age, setAge] = useState("");
  const [applied, setApplied] = useState<{ city?: string; age?: string }>({});
  const [candidates, setCandidates] = useState<RankedCandidate[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCandidates(null);

    async function load() {
      try {
        const data = await fetchCandidates(token, applied);

        if (!cancelled) {
          setCandidates(data);
          setIndex(0);
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
  }, [token, applied]);

  const candidate = candidates?.[index] ?? null;

  function applyFilters() {
    if (age.trim() !== "" && !/^\d+$/.test(age.trim())) {
      setFilterError("Возраст должен быть целым числом");

      return;
    }

    setFilterError(null);
    setApplied({
      city: city.trim() || undefined,
      age: age.trim() || undefined,
    });
  }

  async function swipe(kind: SwipeKind) {
    if (!candidate || pending) {
      return;
    }

    if (kind === "superlike" && note.trim() === "") {
      setError("У суперлайка нужна заметка");

      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await sendSwipe(
        token,
        kind === "superlike"
          ? { kind, targetId: candidate.card.id, note: note.trim() }
          : { kind, targetId: candidate.card.id },
      );
      setOutcome(
        result.status === "matched"
          ? "Взаимно"
          : result.status === "liked"
            ? "Лайк отправлен"
            : "Пропуск",
      );
      setNote("");
      setIndex((current) => current + 1);
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    } finally {
      setPending(false);
    }
  }

  async function undo() {
    setPending(true);
    setError(null);

    try {
      await undoSwipe(token);
      setApplied((current) => ({ ...current }));
      setOutcome("Последняя карточка возвращена");
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <label>
          <span>Город</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label>
          <span>Возраст</span>
          <input value={age} inputMode="numeric" onChange={(event) => setAge(event.target.value)} />
        </label>
        <button type="submit" className="skip">
          Сузить
        </button>
      </form>
      {filterError ? <p className="status error">{filterError}</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {outcome ? <p className="outcome">{outcome}</p> : null}
      <button type="button" className="skip undo" disabled={pending} onClick={() => void undo()}>
        Вернуть последнюю
      </button>
      {!candidates && !error ? <p className="status">Подбираем кандидатов…</p> : null}
      {candidate ? (
        <article className="card">
          <p className="meta">{candidate.card.city}</p>
          <p className="score">Совместимость {candidate.score}</p>
          <ul className="reasons">
            {candidate.reasons.map((reason) => (
              <li key={`${reason.code}-${"interest" in reason ? reason.interest : reason.code}`}>
                {reasonLabel(reason)}
              </li>
            ))}
          </ul>
          <h2>
            {candidate.card.name}, {candidate.card.age}
          </h2>
          <p className="bio">{candidate.card.bio}</p>
          <div className="actions">
            <button
              type="button"
              className="skip"
              disabled={pending}
              onClick={() => void swipe("pass")}
            >
              Пропустить
            </button>
            <button
              type="button"
              className="like"
              disabled={pending}
              onClick={() => void swipe("like")}
            >
              Нравится
            </button>
            <button
              type="button"
              className="superlike"
              disabled={pending}
              onClick={() => void swipe("superlike")}
            >
              Суперлайк
            </button>
          </div>
          <label className="note">
            <span>Заметка к суперлайку</span>
            <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
          </label>
          <PersonActions
            token={token}
            profileId={candidate.card.id}
            onBlocked={() => setIndex((current) => current + 1)}
          />
        </article>
      ) : null}
      {candidates && !candidate && !error ? (
        <p className="status done">Это все кандидаты. Уже оценённые не вернутся.</p>
      ) : null}
    </section>
  );
}
