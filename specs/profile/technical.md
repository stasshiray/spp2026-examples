# Анкета

Слои: `http` принимает тело и зовёт сервис, сервис проверяет правила, репозиторий пишет Drizzle. Express не принимает байты файла.

## Данные

- `profiles` — существующие `name`, `age`, `city`, `bio`.
- `profile_interests` — уникальная пара `profile_id` + `interest`, вес обновляется через upsert.
- `profile_prompts` — `profile_id`, `question`, `answer`, уникальность по профилю и вопросу.
- `search_preferences` — одна строка на профиль: `age_min`, `age_max`, `cities` (text[]), `interests` (text[]).
- `profile_photos` — `profile_id`, `object_key`, `is_primary`.

## Загрузка

Локально MinIO в `docker-compose.deps.yml`: образ `minio/minio`, команда `server /data`, порт API `9000`, консоль `9001`. В `apps/api` зависимости `@aws-sdk/client-s3` и `@aws-sdk/s3-request-presigner`. Клиент с `endpoint` MinIO и `forcePathStyle: true`.

1. `POST /api/me/photos/uploads` с `contentType` и `contentLength`. Ответ: `key`, `uploadUrl`. Ссылка живёт минуты.
2. Браузер делает `PUT` по `uploadUrl`.
3. `POST /api/me/photos` с `key` и `primary`. Сервис делает `HeadObject`. Нет объекта — `400`. Есть — строка в `profile_photos`.

## Методы

- `PATCH /api/me` — частичное обновление имени, возраста, города, био.
- `PUT /api/me/interests` — замена всего набора.
- `PUT /api/me/prompts` — замена ответов.
- `PUT /api/me/preferences` — замена документа. `ageMin > ageMax` даёт `400`.
- `GET /api/me` возвращает профиль вместе с интересами, ответами, предпочтениями и фото.

Все методы требуют Bearer. Ошибки предметной области — `HttpError`, статус ставит общий error middleware.
