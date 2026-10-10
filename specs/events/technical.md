# Мероприятия и совместный поиск

Лента события — `GET /api/events/:id/candidates`, не query городской ленты. Место кончается `409`. Квота приглашений кончается `429`. Это разные отказы.

## Данные

- `events`: `id`, `city`, `place`, `starts_at`, `capacity`.
- `event_attendance`: `event_id`, `profile_id`, `status` (`interested`, `waitlisted`, `going`, `cancelled`, `checked_in`), `created_at`. Уникальная пара событие + человек.
- `event_companions`: `event_id`, `profile_low_id`, `profile_high_id`, `status` (`invited`, `confirmed`, `companion_left`). Один `confirmed` на человека на событие.
- `search_sessions` и `search_votes`: сессия из двух участников, голос — `session_id`, `voter_id`, `target_id`. Флаг `revealed` на сессии.

Запись «хочу пойти» атомарна: два одновременных запроса на последнее место не получают оба `going`. Проигравший становится `waitlisted`.

## Методы

- `GET /api/events?city=&cursor=` — лента по дате.
- `PUT /api/events/:id/attendance` — тело `{ "status": "going" | "cancelled" }`. Повтор возвращает текущую строку. Событие в прошлом — `409`. Нет мест — статус `waitlisted`, не ошибка. Явный отказ из-за гонки последнего места в ответе всё равно `waitlisted`.
- `POST /api/events/:id/companions` — `{ "profileId" }`. Уже висящее приглашение — `200`. У кого-то есть спутник — `409` и `companionId`. Суточная квота приглашений — 10, исчерпание `429` с `resetsAt`. Повтор тому же человеку квоту не тратит.
- `DELETE /api/events/:id/attendance` — статус `cancelled`, пара переходит в `companion_left`, первый `waitlisted` становится `going` в той же операции.
- `POST /api/events/:id/check-in` — свой статус `checked_in`. После `starts_at` новые `POST companions` — `409`.
- `POST /api/events/:id/search-sessions` — создать сессию с `partnerId`.
- `PUT /api/events/:id/search-sessions/:sessionId/votes` — свой голос. `GET` шорт-листа до второго голоса отдаёт `waiting_for_partner` и пустой список. После второго — пересечение и `revealed`. Следующий `PUT` после раскрытия — `409`.

Отмена, подъём с листа и `companion_left` коммитятся одной транзакцией.
