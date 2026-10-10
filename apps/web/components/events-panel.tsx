import { useEffect, useState } from "react";
import {
  checkIn,
  describeApiError,
  fetchEventCandidates,
  fetchEvents,
  fetchShortlist,
  inviteCompanion,
  leaveEvent,
  openSearch,
  saveVotes,
  setAttendance,
  type EventItem,
  type Profile,
  type Shortlist,
} from "../lib/api";

export function EventsPanel({ token, city }: { token: string; city: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [shortlist, setShortlist] = useState<Shortlist | null>(null);

  async function reload() {
    const page = await fetchEvents(token, city);
    setItems(page.items);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await fetchEvents(token, city);

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
  }, [token, city]);

  async function run(action: () => Promise<void>) {
    setError(null);

    try {
      await action();
      await reload();
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    }
  }

  async function showPeople(eventId: number) {
    setOpenId(eventId);
    setSessionId(null);
    setShortlist(null);
    setPeople(await fetchEventCandidates(token, eventId));
  }

  function attendanceLabel(status: string) {
    switch (status) {
      case "going":
        return "Вы идёте";
      case "waitlisted":
        return "Вы в листе ожидания";
      case "checked_in":
        return "Вы на месте";
      case "cancelled":
        return "Вы не идёте";
      default:
        return status;
    }
  }

  return (
    <section className="stack">
      {error ? <p className="status error">{error}</p> : null}
      {!items && !error ? <p className="status">Ищем события…</p> : null}
      {items?.map((item) => (
        <article className="card" key={item.id}>
          <p className="meta">
            {item.city} · мест осталось {item.seatsLeft} из {item.capacity}
          </p>
          <h2>{item.place}</h2>
          <p className="bio">{new Date(item.startsAt).toLocaleString("ru")}</p>
          {item.attendance ? (
            <p className="score">{attendanceLabel(item.attendance.status)}</p>
          ) : null}
          {item.companion?.status === "confirmed" ? (
            <p className="bio">Спутник: {item.companion.profile.name}</p>
          ) : null}
          {item.companion?.status === "invited" ? (
            <p className="bio">Приглашение: {item.companion.profile.name}</p>
          ) : null}
          {item.companion?.status === "companion_left" ? (
            <p className="status error">{item.companion.profile.name} больше не идёт с вами</p>
          ) : null}
          <div className="actions two">
            <button
              type="button"
              className="like"
              onClick={() =>
                void run(() => setAttendance(token, item.id, "going").then(() => undefined))
              }
            >
              Хочу пойти
            </button>
            <button
              type="button"
              className="skip"
              onClick={() => void run(() => leaveEvent(token, item.id).then(() => undefined))}
            >
              Не пойду
            </button>
          </div>
          <div className="actions two">
            <button
              type="button"
              className="skip"
              onClick={() =>
                void showPeople(item.id).catch((reason: unknown) =>
                  setError(describeApiError(reason)),
                )
              }
            >
              Кто идёт
            </button>
            <button
              type="button"
              className="skip"
              onClick={() => void run(() => checkIn(token, item.id).then(() => undefined))}
            >
              Я на месте
            </button>
          </div>
          {openId === item.id ? (
            <div className="stack">
              {people.map((person) => (
                <div className="row" key={person.id}>
                  <span>
                    {person.name}, {person.age}
                  </span>
                  <button
                    type="button"
                    className="superlike"
                    onClick={() =>
                      void run(() =>
                        inviteCompanion(token, item.id, person.id).then(() => undefined),
                      )
                    }
                  >
                    Пойдём вместе
                  </button>
                </div>
              ))}
              {item.companion?.status === "confirmed" ? (
                <button
                  type="button"
                  className="like"
                  onClick={() =>
                    void run(async () => {
                      const session = await openSearch(
                        token,
                        item.id,
                        item.companion?.profile.id ?? 0,
                      );
                      setSessionId(session.id);
                      setShortlist(await fetchShortlist(token, item.id, session.id));
                    })
                  }
                >
                  Искать вместе
                </button>
              ) : null}
              {sessionId !== null ? (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();

                    void run(async () => {
                      setShortlist(await saveVotes(token, item.id, sessionId, picked));
                    });
                  }}
                >
                  {people.map((person) => (
                    <label key={person.id} className="check">
                      <input
                        type="checkbox"
                        checked={picked.includes(person.id)}
                        onChange={(event) => {
                          setPicked((current) =>
                            event.target.checked
                              ? [...current, person.id]
                              : current.filter((id) => id !== person.id),
                          );
                        }}
                      />
                      {person.name}
                    </label>
                  ))}
                  <button type="submit" className="like">
                    Отправить голос
                  </button>
                </form>
              ) : null}
              {shortlist ? (
                <div>
                  <p className="meta">
                    {shortlist.status === "waiting_for_partner"
                      ? "Ждём голос спутника"
                      : "Общий шорт-лист"}
                  </p>
                  {shortlist.shortlist.map((person) => (
                    <p key={person.id}>{person.name}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
