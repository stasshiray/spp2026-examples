# Lecture 1 — Next.js + Express + PostgreSQL + Drizzle

Демо для лекции: два отдельных приложения. Фронтенд на Next.js ходит в Express API, API читает данные из PostgreSQL через Drizzle. У каждого сервиса свой Dockerfile; деплой рассчитан на **Render Free Tier** (два web-сервиса + Postgres).

## Как это устроено

- `apps/web` — Next.js (App Router), в Docker собирается как `standalone`. Браузер ходит в API по `NEXT_PUBLIC_API_URL`.
- `apps/api` — Express + TypeScript + Drizzle. Отдаёт `/api/books` и `/api/health`, при старте накатывает миграции и сидирует демо-книги.
- `apps/web/Dockerfile` и `apps/api/Dockerfile` — отдельные образы, контекст сборки — корень репозитория (npm workspaces).

## Локальный запуск

Нужны Node.js 20+ и Docker (для Postgres).

```bash
cp .env.example .env
npm install
docker compose up db -d
npm run dev
```

- фронт: http://localhost:3000
- API: http://localhost:4000/api/books

Локальный Postgres в Compose слушает **5433**, чтобы не пересечься с другими контейнерами на 5432.

Линтер и тесты (тесты API ходят в Postgres):

```bash
npm run lint
DATABASE_URL=postgres://postgres:postgres@localhost:5433/lecture npm test
```

Прод-образы локально:

```bash
docker compose up --build
```

- http://localhost:3000 — web
- http://localhost:4000 — api

## Деплой на Render (Free Tier)

1. Создайте репозиторий на GitHub и запушьте `master`.
2. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**, укажите репозиторий. Файл `render.yaml` создаст:
   - Free Web Service `lecture-1-api` из `apps/api/Dockerfile`
   - Free Web Service `lecture-1-web` из `apps/web/Dockerfile`
   - Free PostgreSQL `lecture-1-db`
3. Auto-deploy выключен: деплой идёт из GitHub Actions через Deploy Hook каждого сервиса.
4. В каждом web-сервисе: **Settings → Deploy Hook** — скопируйте URL.
5. В GitHub: **Settings → Secrets and variables → Actions**:
   - `RENDER_API_DEPLOY_HOOK_URL`
   - `RENDER_WEB_DEPLOY_HOOK_URL`

`NEXT_PUBLIC_API_URL` на фронте берётся из публичного URL API-сервиса и нужен на этапе Docker-сборки Next.js.

Ограничения Free Tier: сервисы засыпают без трафика (холодный старт), бесплатная Postgres ограничена по времени/размеру. SSL к Render Postgres включается в клиенте автоматически (для `localhost` SSL выключен).

## GitHub Actions

На каждый push/PR в `master`:

1. `npm ci`
2. линтер
3. тесты против Postgres service container

На push в `master` после зелёных проверок: `POST` на deploy hook API и web.

## Полезные команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | API + Next.js параллельно |
| `npm run db:generate` | сгенерировать миграции Drizzle |
| `npm run build` | сборка web + api |
| `docker compose up --build` | оба образа + Postgres локально |
