# Lecture 1 — Next.js + Express + PostgreSQL + Drizzle

Демо для лекции: два отдельных приложения. Фронтенд на Next.js ходит в Express API, API читает данные из PostgreSQL через Drizzle. У каждого сервиса свой Dockerfile. Можно поднять стек через Docker Compose, задеплоить в **локальный Kubernetes** (Docker Desktop), в **GKE** или на **Render Free Tier**.

## Как это устроено

- `apps/web` — Next.js (App Router), в Docker собирается как `standalone`. Браузер ходит в API по `NEXT_PUBLIC_API_URL`. В Kubernetes URL пустой: запросы идут на тот же host (`/api/books`).
- `apps/api` — Express + TypeScript + Drizzle. Отдаёт `/api/books`, `/api/health` и `GET /` (для проб балансировщика). При старте накатывает миграции и сидирует демо-книги.
- `apps/web/Dockerfile` и `apps/api/Dockerfile` — отдельные образы, контекст сборки — корень репозитория (npm workspaces).
- `k8s/manifests/` — Namespace, Postgres, API, web и Gateway API (`HTTPRoute`) для локального кластера и GKE.

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

Вручную, с любой ветки: **Actions → Deploy to GKE → Run workflow**. В UI выберите ветку — namespace и URL берутся из её имени (`feature/login` → `feature-login`). Снести окружение: **Destroy GKE environment** (тоже `workflow_dispatch`; можно указать namespace явно).

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

## GKE (Google Cloud)

Нужны `gcloud`, `kubectl`, Docker и `envsubst`. Один раз создайте кластер GKE, скопируйте env и заполните `GCP_PROJECT_ID`, `GKE_CLUSTER`, `GKE_LOCATION`, `GCP_REGION` (`AR_REPOSITORY` по умолчанию `repository-1`):

```bash
cp k8s/gke.env.example k8s/gke.env
./k8s/create-gke-artifact-registry.sh
```

Скрипт идемпотентный: включает Artifact Registry API, создаёт Docker-репозиторий `repository-1` в `GCP_REGION` (если его ещё нет), выдаёт `roles/artifactregistry.reader` Compute Engine default SA (чтобы ноды могли тянуть образы) и `roles/artifactregistry.writer` текущему `gcloud`-аккаунту (чтобы пушить). Без reader поды зависнут в `ImagePullBackOff` (403 Forbidden).

Затем:

```bash
./k8s/install-gke-gateway.sh
```

Скрипт напечатает IP Gateway. Пропишите `INGRESS_DOMAIN` в `k8s/gke.env` как `{ip}.sslip.io` (например `8.232.28.79.sslip.io`), не голый `sslip.io`. После этого:

```bash
./k8s/deploy-gke-kubernetes.sh
```

Сборка идёт под `linux/amd64` (ноды GKE). С Mac без этого флага в реестр попадает `arm64`, и поды падают с `ImagePullBackOff` / `no match for platform in manifest`.

URL: `http://{ветка}.{INGRESS_DOMAIN}` (ветка `main` → `http://main.{ip}.sslip.io`). Gateway слушает только HTTP `:80`; `https://` даёт обрыв TLS («filter aborted» / `SSL_ERROR_SYSCALL`). Снести окружение текущей ветки:

```bash
./k8s/destroy-gke-kubernetes.sh
```

Тот же деплой/снос можно запустить из GitHub Actions с любой ветки (`workflow_dispatch`). Один раз в репозитории:

1. Те же имена, что в `k8s/gke.env`, в **Secrets** или **Variables** (Settings → Secrets and variables → Actions): `GCP_PROJECT_ID`, `GKE_CLUSTER`, `GKE_LOCATION`, `GCP_REGION`, `INGRESS_DOMAIN`. Опционально `AR_REPOSITORY` (по умолчанию `repository-1`) и `GATEWAY_CLASS`. Вкладки разные: `/settings/secrets/actions` — secrets, `/settings/variables/actions` — variables; workflow читает и те и другие.
2. Сервис-аккаунт и Workload Identity Federation (JSON-ключи в этом проекте запрещены политикой IAM):

```bash
./k8s/create-gke-github-sa.sh
```

Скрипт создаёт SA `github-actions`, выдаёт `roles/container.developer` и `roles/artifactregistry.writer`, пул/OIDC-провайдер GitHub и привязку к `origin` (`owner/repo`). В конце печатает ещё два значения: `GCP_WORKLOAD_IDENTITY_PROVIDER` и `GCP_SERVICE_ACCOUNT` — их тоже нужно добавить как secret или variable. Secret `GCP_SA_KEY` не нужен. Gateway должен уже стоять (`./k8s/install-gke-gateway.sh`). Если remote не GitHub, задайте `GITHUB_REPOSITORY=owner/repo`.

Не удаляйте namespace `gateway`. Envoy Gateway в GKE не ставится — используется `GatewayClass` `gke-l7-global-external-managed`.

## Полезные команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | API + Next.js параллельно |
| `npm run db:generate` | сгенерировать миграции Drizzle |
| `npm run build` | сборка web + api |
| `./k8s/install-local-gateway.sh` | один раз: Envoy Gateway в Docker Desktop |
| `./k8s/deploy-local-kubernetes.sh` | окружение текущей ветки в локальный Kubernetes |
| `./k8s/destroy-local-kubernetes.sh` | удалить namespace текущей ветки |
| `./k8s/create-gke-artifact-registry.sh` | один раз: Artifact Registry `repository-1` и IAM |
| `./k8s/create-gke-github-sa.sh` | один раз: SA GitHub Actions и Workload Identity Federation |
| `./k8s/install-gke-gateway.sh` | один раз: Gateway в GKE |
| `./k8s/deploy-gke-kubernetes.sh` | окружение текущей ветки в GKE |
| `./k8s/destroy-gke-kubernetes.sh` | удалить namespace текущей ветки в GKE |
