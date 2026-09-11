"use client";

import { useEffect, useState } from "react";
import { profilesApiPath } from "../lib/api";

type Profile = {
  id: number;
  name: string;
  age: number;
  city: string;
  bio: string;
};

export default function HomePage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(profilesApiPath())
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as Profile[];
      })
      .then((data) => {
        if (!cancelled) {
          setProfiles(data);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unknown error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const profile = profiles?.[index] ?? null;
  const remaining = profiles ? Math.max(profiles.length - index, 0) : 0;

  function nextProfile() {
    setIndex((current) => current + 1);
  }

  return (
    <main className="page">
      <p className="kicker">Lecture 1 · Demo</p>
      <h1>Знакомства</h1>
      <p className="lead">
        Next.js читает демо-профили с Express API, который берёт их из PostgreSQL через Drizzle.
      </p>

      {!profiles && !error ? <p className="status">Загружаем профили…</p> : null}
      {error ? <p className="status error">Не удалось загрузить данные: {error}</p> : null}

      {profile ? (
        <section className="deck">
          <article className="card">
            <p className="meta">
              {profile.city} · ещё {remaining}
            </p>
            <h2>
              {profile.name}, {profile.age}
            </h2>
            <p className="bio">{profile.bio}</p>
            <div className="actions">
              <button type="button" className="skip" onClick={nextProfile}>
                Пропустить
              </button>
              <button type="button" className="like" onClick={nextProfile}>
                Нравится
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {profiles && !profile && !error ? (
        <p className="status done">Это все демо-профили. Обновите страницу, чтобы начать снова.</p>
      ) : null}
    </main>
  );
}
