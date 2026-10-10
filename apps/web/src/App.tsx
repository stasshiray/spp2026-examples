import { useEffect } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import {
  ChatScreen,
  EventsScreen,
  FeedScreen,
  LikesScreen,
  MatchesScreen,
  ProfileScreen,
} from "../components/feature-screens";
import { SessionProvider } from "../components/session";
import { SiteNav } from "../components/site-nav";

const TITLES: Record<string, string> = {
  "/": "Лента — Знакомства",
  "/likes": "Лайки — Знакомства",
  "/matches": "Пары — Знакомства",
  "/events": "События — Знакомства",
  "/profile": "Анкета — Знакомства",
};

function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith("/matches/") && pathname !== "/matches") {
      document.title = "Переписка — Знакомства";

      return;
    }

    document.title = TITLES[pathname] ?? "Знакомства";
  }, [pathname]);

  return null;
}

function FeedPage() {
  return (
    <main>
      <p className="kicker">Лента</p>
      <h1>Кого посмотреть</h1>
      <p className="lead">
        Карточки идут по совместимости. Фильтр города и возраста только сужает сохранённые
        предпочтения.
      </p>
      <FeedScreen />
    </main>
  );
}

function LikesPage() {
  return (
    <main>
      <p className="kicker">Лайки</p>
      <h1>Кто вас отметил</h1>
      <p className="lead">
        Отдельный список, не общая лента людей. Заметку суперлайка видите вы и автор.
      </p>
      <LikesScreen />
    </main>
  );
}

function MatchesPage() {
  return (
    <main>
      <p className="kicker">Пары</p>
      <h1>С кем совпали</h1>
      <p className="lead">Пока нет сообщений, пара ждёт. Закрытая из списка пропадает.</p>
      <MatchesScreen />
    </main>
  );
}

function MatchChatPage() {
  const { id } = useParams();

  return (
    <main>
      <p className="kicker">Пара</p>
      <h1>Переписка</h1>
      <p className="lead">
        Сообщения идут от старых к новым и приходят сразу. Первое можно начать с заметки суперлайка.
      </p>
      <ChatScreen matchId={Number(id)} />
    </main>
  );
}

function EventsPage() {
  return (
    <main>
      <p className="kicker">События</p>
      <h1>Куда пойти</h1>
      <p className="lead">
        Место, спутник и общий шорт-лист. Поход на событие не делает людей парой в городской ленте.
      </p>
      <EventsScreen />
    </main>
  );
}

function ProfilePage() {
  return (
    <main>
      <p className="kicker">Анкета</p>
      <h1>Ваша карточка</h1>
      <p className="lead">
        Имя, интересы, короткие ответы, кого ищете и фото. Чужую анкету здесь не правят.
      </p>
      <ProfileScreen />
    </main>
  );
}

function NotFoundPage() {
  return (
    <main>
      <h1>Страница не найдена</h1>
      <p className="lead">
        <Link to="/">На ленту</Link>
      </p>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <div className="page">
          <SiteNav />
          <DocumentTitle />
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/deck" element={<Navigate to="/" replace />} />
            <Route path="/likes" element={<LikesPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/matches/:id" element={<MatchChatPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </SessionProvider>
    </BrowserRouter>
  );
}
