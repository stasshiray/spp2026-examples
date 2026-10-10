import { useState, type FormEvent } from "react";
import { useSession } from "./session";

export function LoginForm() {
  const { error, pending, signIn } = useSession();
  const [loginName, setLoginName] = useState("anna");
  const [password, setPassword] = useState("anna");

  return (
    <form
      className="login"
      onSubmit={(event: FormEvent) => void signIn(event, loginName, password)}
    >
      <label>
        <span>Логин</span>
        <input
          value={loginName}
          autoComplete="username"
          onChange={(event) => setLoginName(event.target.value)}
        />
      </label>
      <label>
        <span>Пароль</span>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" className="like" disabled={pending}>
        Войти
      </button>
      {error ? <p className="status error">{error}</p> : null}
      <p className="status">Демо: логин и пароль совпадают, например anna / anna.</p>
    </form>
  );
}
