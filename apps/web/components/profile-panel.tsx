import { useState } from "react";
import {
  PROMPT_QUESTIONS,
  describeApiError,
  patchProfile,
  saveInterests,
  savePreferences,
  savePrompts,
  uploadPhoto,
  type ViewerProfile,
} from "../lib/api";

export function ProfilePanel({
  token,
  viewer,
  onChange,
}: {
  token: string;
  viewer: ViewerProfile;
  onChange: (viewer: ViewerProfile) => void;
}) {
  const [name, setName] = useState(viewer.name);
  const [age, setAge] = useState(String(viewer.age));
  const [city, setCity] = useState(viewer.city);
  const [bio, setBio] = useState(viewer.bio);
  const [interests, setInterests] = useState(
    viewer.interests.map((item) => `${item.interest}:${item.weight}`).join("\n"),
  );
  const [prompts, setPrompts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      PROMPT_QUESTIONS.map((question) => [
        question,
        viewer.prompts.find((item) => item.question === question)?.answer ?? "",
      ]),
    ),
  );
  const [ageMin, setAgeMin] = useState(String(viewer.preferences?.ageMin ?? 18));
  const [ageMax, setAgeMax] = useState(String(viewer.preferences?.ageMax ?? 40));
  const [cities, setCities] = useState(viewer.preferences?.cities.join(", ") ?? "");
  const [wanted, setWanted] = useState(viewer.preferences?.interests.join(", ") ?? "");
  const [primary, setPrimary] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function save(action: () => Promise<ViewerProfile>) {
    setError(null);

    try {
      onChange(await action());
    } catch (reason: unknown) {
      setError(describeApiError(reason));
    }
  }

  return (
    <section className="stack">
      {error ? <p className="status error">{error}</p> : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const parsedAge = Number(age);

          if (!Number.isInteger(parsedAge)) {
            setError("Возраст должен быть целым числом");

            return;
          }

          void save(() => patchProfile(token, { name, age: parsedAge, city, bio }));
        }}
      >
        <label className="note">
          <span>Имя</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="note">
          <span>Возраст</span>
          <input value={age} onChange={(event) => setAge(event.target.value)} />
        </label>
        <label className="note">
          <span>Город</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label className="note">
          <span>О себе</span>
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        <button type="submit" className="like">
          Сохранить карточку
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = interests
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "")
            .map((line) => {
              const [interest, weight] = line.split(":");

              return { interest: interest?.trim() ?? "", weight: Number(weight) };
            });

          void save(() => saveInterests(token, parsed));
        }}
      >
        <label className="note">
          <span>Интересы, каждый с весом: кофе:3</span>
          <textarea value={interests} onChange={(event) => setInterests(event.target.value)} />
        </label>
        <button type="submit" className="like">
          Сохранить интересы
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save(() =>
            savePrompts(
              token,
              PROMPT_QUESTIONS.map((question) => ({
                question,
                answer: prompts[question] ?? "",
              })),
            ),
          );
        }}
      >
        {PROMPT_QUESTIONS.map((question) => (
          <label className="note" key={question}>
            <span>{question}</span>
            <textarea
              value={prompts[question] ?? ""}
              onChange={(event) =>
                setPrompts((current) => ({ ...current, [question]: event.target.value }))
              }
            />
          </label>
        ))}
        <button type="submit" className="like">
          Сохранить ответы
        </button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save(() =>
            savePreferences(token, {
              ageMin: Number(ageMin),
              ageMax: Number(ageMax),
              cities: cities
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== ""),
              interests: wanted
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== ""),
            }),
          );
        }}
      >
        <label className="note">
          <span>Возраст от</span>
          <input value={ageMin} onChange={(event) => setAgeMin(event.target.value)} />
        </label>
        <label className="note">
          <span>Возраст до</span>
          <input value={ageMax} onChange={(event) => setAgeMax(event.target.value)} />
        </label>
        <label className="note">
          <span>Города через запятую</span>
          <input value={cities} onChange={(event) => setCities(event.target.value)} />
        </label>
        <label className="note">
          <span>Интересы через запятую</span>
          <input value={wanted} onChange={(event) => setWanted(event.target.value)} />
        </label>
        <button type="submit" className="like">
          Сохранить, кого ищу
        </button>
      </form>
      <label className="check">
        <input
          type="checkbox"
          checked={viewer.paused}
          onChange={(event) =>
            void save(() => patchProfile(token, { paused: event.target.checked }))
          }
        />
        Скрыть анкету из чужих лент
      </label>
      <label className="note">
        <span>Фото с устройства</span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (!file) {
              return;
            }

            void save(async () => {
              await uploadPhoto(token, file, primary);

              return patchProfile(token, {});
            });
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={primary}
          onChange={(event) => setPrimary(event.target.checked)}
        />
        Сделать главным
      </label>
      <div className="photos">
        {viewer.photos.map((photo) =>
          photo.url ? (
            <img key={photo.id} src={photo.url} alt={photo.primary ? "Главное фото" : "Фото"} />
          ) : null,
        )}
      </div>
    </section>
  );
}
