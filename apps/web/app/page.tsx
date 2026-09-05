"use client";

import { useEffect, useState } from "react";
import { booksApiPath } from "../lib/api";

type Book = {
  id: number;
  title: string;
  author: string;
  year: number;
};

export default function HomePage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(booksApiPath())
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as Book[];
      })
      .then((data) => {
        if (!cancelled) {
          setBooks(data);
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

  return (
    <main className="page">
      <p className="kicker">Lecture 1 · Demo</p>
      <h1>Каталог книг</h1>
      <p className="lead">
        Next.js читает демо-данные с Express API, который берёт их из PostgreSQL через Drizzle.
      </p>

      {!books && !error ? <p className="status">Загружаем книги…</p> : null}
      {error ? <p className="status error">Не удалось загрузить данные: {error}</p> : null}

      {books ? (
        <section className="list">
          {books.map((book) => (
            <article className="card" key={book.id}>
              <div>
                <h2>{book.title}</h2>
                <p>{book.author}</p>
              </div>
              <span className="year">{book.year}</span>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
