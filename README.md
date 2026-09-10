# Lecture 1 — Next.js + Express + PostgreSQL + Drizzle

Демо для лекции: два отдельных приложения. Фронтенд на Next.js ходит в Express API, API читает данные из PostgreSQL через Drizzle. У каждого сервиса свой Dockerfile. Можно поднять стек через Docker Compose, задеплоить в **локальный Kubernetes** (Docker Desktop) или на **Render Free Tier**.

## Как это устроено

- `apps/web` — Next.js (App Router), в Docker собирается как `standalone`. Браузер ходит в API по `NEXT_PUBLIC_API_URL`. В Kubernetes URL пустой: запросы идут на тот же host (`/api/books`).
- `apps/api` — Express + TypeScript + Drizzle. Отдаёт `/api/books`, `/api/health` и `GET /` (для проб балансировщика). При старте накатывает миграции и сидирует демо-книги.
- `apps/web/Dockerfile` и `apps/api/Dockerfile` — отдельные образы, контекст сборки — корень репозитория (npm workspaces).
- `k8s/manifests/` — Namespace, Postgres, API, web и Gateway API (`HTTPRoute`) для локального кластера.

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

1. Создайте репозиторий на GitHub и запушьте `main`.
2. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**, укажите репозиторий. Файл `render.yaml` создаст:
   - Free Web Service `lecture-1-api` из `apps/api/Dockerfile`
   - Free Web Service `lecture-1-web` из `apps/web/Dockerfile`
   - Free PostgreSQL `lecture-1-db`
3. В `render.yaml` стоит `autoDeployTrigger: checksPass`: Render деплоит только после успешных CI checks (линтер и тесты) на связанной ветке. Если checks падают или их нет, деплой не стартует.

`NEXT_PUBLIC_API_URL` на фронте берётся из публичного URL API-сервиса и нужен на этапе Docker-сборки Next.js.

Ограничения Free Tier: сервисы засыпают без трафика (холодный старт), бесплатная Postgres ограничена по времени/размеру. SSL к Render Postgres включается в клиенте автоматически (для `localhost` SSL выключен).

## GitHub Actions

На каждый push/PR в `main`:

1. `npm ci`
2. линтер
3. тесты против Postgres service container

На push в `main` Render сам запускает деплой API и web, когда job `lint-and-test` зелёный.

## Локальный Kubernetes (Docker Desktop)

Включите Kubernetes в Docker Desktop, затем:

```bash
./k8s/install-local-gateway.sh
./k8s/deploy-local-kubernetes.sh
```

Первый скрипт — один раз (Envoy Gateway); повторный запуск безопасен. Второй поднимает окружение текущей ветки: namespace и URL `http://{ветка}.localhost` (ветка `main` → http://main.localhost).

Снести окружение текущей ветки (не удаляет `gateway` и `envoy-gateway-system`):

```bash
./k8s/destroy-local-kubernetes.sh
```

## Полезные команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | API + Next.js параллельно |
| `npm run db:generate` | сгенерировать миграции Drizzle |
| `npm run build` | сборка web + api |
| `./k8s/install-local-gateway.sh` | один раз: Envoy Gateway в Docker Desktop |
| `./k8s/deploy-local-kubernetes.sh` | окружение текущей ветки в локальный Kubernetes |
| `./k8s/destroy-local-kubernetes.sh` | удалить namespace текущей ветки |
