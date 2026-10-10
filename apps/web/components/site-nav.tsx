import { Link, useLocation } from "react-router";
import { useSession } from "./session";

const LINKS = [
  { href: "/", label: "Лента" },
  { href: "/likes", label: "Лайки" },
  { href: "/matches", label: "Пары" },
  { href: "/events", label: "События" },
  { href: "/profile", label: "Анкета" },
] as const;

export function SiteNav() {
  const { pathname } = useLocation();
  const { viewer, signOut } = useSession();

  return (
    <header className="nav">
      <Link to="/" className="brand">
        Знакомства
      </Link>
      {viewer ? (
        <nav className="nav-links" aria-label="Разделы">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link key={link.href} to={link.href} className={active ? "active" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      ) : (
        <span className="nav-spacer" />
      )}
      {viewer ? (
        <div className="nav-user">
          <span>
            {viewer.name}, {viewer.age}
            {viewer.paused ? " · пауза" : ""}
          </span>
          <button type="button" className="logout" onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
      ) : null}
    </header>
  );
}
