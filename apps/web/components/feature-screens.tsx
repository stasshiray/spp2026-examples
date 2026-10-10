import { useEffect, useState } from "react";
import { describeApiError, fetchMatches, type MatchItem } from "../lib/api";
import { ChatPanel } from "./chat-panel";
import { DeckPanel } from "./deck-panel";
import { EventsPanel } from "./events-panel";
import { LikesPanel } from "./likes-panel";
import { MatchesPanel } from "./matches-panel";
import { ProfilePanel } from "./profile-panel";
import { LoginForm } from "./login-form";
import { SessionGate } from "./session-gate";
import { useSession } from "./session";

export function FeedScreen() {
  const { ready, token, viewer, error } = useSession();

  if (!ready || (token && !viewer && !error)) {
    return <p className="status">Загружаем профиль…</p>;
  }

  if (error && !viewer) {
    return <p className="status error">{error}</p>;
  }

  if (!token || !viewer) {
    return <LoginForm />;
  }

  return <DeckPanel token={token} />;
}

export function LikesScreen() {
  return <SessionGate>{({ token }) => <LikesPanel token={token} />}</SessionGate>;
}

export function MatchesScreen() {
  return <SessionGate>{({ token }) => <MatchesPanel token={token} />}</SessionGate>;
}

export function EventsScreen() {
  return (
    <SessionGate>
      {({ token, viewer }) => <EventsPanel token={token} city={viewer.city} />}
    </SessionGate>
  );
}

export function ProfileScreen() {
  const { setViewer } = useSession();

  return (
    <SessionGate>
      {({ token, viewer }) => <ProfilePanel token={token} viewer={viewer} onChange={setViewer} />}
    </SessionGate>
  );
}

export function ChatScreen({ matchId }: { matchId: number }) {
  return <SessionGate>{({ token }) => <ChatLoader token={token} matchId={matchId} />}</SessionGate>;
}

function ChatLoader({ token, matchId }: { token: string; matchId: number }) {
  const [match, setMatch] = useState<MatchItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(matchId)) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const page = await fetchMatches(token);
        const found = page.items.find((item) => item.id === matchId) ?? null;

        if (!cancelled) {
          setMatch(found);
          setError(found ? null : "Пара не найдена");
        }
      } catch (reason: unknown) {
        if (!cancelled) {
          setError(describeApiError(reason));
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token, matchId]);

  if (!Number.isInteger(matchId)) {
    return <p className="status error">Некорректная пара</p>;
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  if (!match) {
    return <p className="status">Открываем переписку…</p>;
  }

  return <ChatPanel key={match.id} match={match} />;
}
