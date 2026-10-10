import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  ApiError,
  describeApiError,
  endSession,
  fetchViewer,
  login,
  type ViewerProfile,
} from "../lib/api";

const TOKEN_KEY = "dating-token";

type SessionState = {
  ready: boolean;
  token: string | null;
  viewer: ViewerProfile | null;
  error: string | null;
  pending: boolean;
  signIn: (event: FormEvent, loginName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setViewer: (viewer: ViewerProfile) => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !token) {
      return;
    }

    const sessionToken = token;
    let cancelled = false;

    async function restore() {
      try {
        const profile = await fetchViewer(sessionToken);

        if (!cancelled) {
          setViewer(profile);
          setError(null);
        }
      } catch (reason: unknown) {
        if (reason instanceof ApiError && reason.status === 401) {
          localStorage.removeItem(TOKEN_KEY);

          if (!cancelled) {
            setToken(null);
            setViewer(null);
          }

          return;
        }

        if (!cancelled) {
          setError(describeApiError(reason));
        }
      }
    }

    void restore();

    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      token,
      viewer,
      error,
      pending,
      async signIn(event, loginName, password) {
        event.preventDefault();
        setPending(true);
        setError(null);

        try {
          const body = await login(loginName, password);
          localStorage.setItem(TOKEN_KEY, body.token);
          setToken(body.token);
          setViewer(await fetchViewer(body.token));
          navigate("/");
        } catch (reason: unknown) {
          setError(describeApiError(reason));
        } finally {
          setPending(false);
        }
      },
      async signOut() {
        if (token) {
          await endSession(token);
        }

        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setViewer(null);
        navigate("/");
      },
      setViewer,
    }),
    [ready, token, viewer, error, pending, navigate],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error("Сессия ещё не подключена");
  }

  return session;
}
