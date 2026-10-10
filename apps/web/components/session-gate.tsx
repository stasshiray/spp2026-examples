import { Link } from "react-router";
import type { ReactNode } from "react";
import type { ViewerProfile } from "../lib/api";
import { useSession } from "./session";

export function SessionGate({
  children,
}: {
  children: (session: { token: string; viewer: ViewerProfile }) => ReactNode;
}) {
  const { ready, token, viewer, error } = useSession();

  if (!ready || (token && !viewer && !error)) {
    return <p className="status">Загружаем профиль…</p>;
  }

  if (error && !viewer) {
    return <p className="status error">{error}</p>;
  }

  if (!token || !viewer) {
    return (
      <p className="status">
        Сначала <Link to="/">войдите</Link>.
      </p>
    );
  }

  return children({ token, viewer });
}
