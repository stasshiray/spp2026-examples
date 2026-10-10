# Лента

`GET /api/me/candidates` и `POST /api/me/swipes` остаются на matching-роутере. Роут тонкий: `asyncRoute`, сервис, `res.json`.

## Выдача

`rank` исключает самого зрителя и всех, на кого у него уже есть строка в `swipes`. Query `city` и `age` применяются после предпочтений из `search_preferences`. Нецелый `age` — `MatchingError` 400.

В элементе ленты рядом с `score` массив `reasons`:

- `{ "code": "same_city" }`
- `{ "code": "age_gap", "years": <number> }`
- `{ "code": "shared_interest", "interest": "<name>" }`

Числовые веса интересов в ответ не попадают. Формула score может меняться, коды причин остаются.

## Входящие

`GET /api/me/likes` — курсор `cursor` и `limit`. Это не `GET /candidates`. Карточка содержит `kind` и `note` только если жест был суперлайком и зритель — получатель.

## Отмена и квота

`POST /api/me/swipes/undo` удаляет последний свайп зрителя. Если по этой паре уже есть активный мэтч — `409`, строка свайпа остаётся.

`swipes.created_at` нужен для окна квоты. Лайк: 20 в сутки. Суперлайк: 5 в сутки. Повтор того же `viewer_id` + `target_id` + `kind` квоту не увеличивает. Исчерпание — `429` с телом `{ "error", "bucket", "remaining", "resetsAt" }`. `remaining` при отказе равен 0. Это не `409`.

Квота считается в сервисе по строкам `swipes` за текущие сутки UTC, не в роуте.
