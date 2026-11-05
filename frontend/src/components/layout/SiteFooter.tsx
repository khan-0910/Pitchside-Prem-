import { Link } from "react-router-dom";

const LINKS = [
  { to: "/app/models", label: "Model performance" },
  { to: "/app/data", label: "Data health" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/credits", label: "Data credits" },
];

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-[13px] ${className}`}>
      <nav aria-label="Footer">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {LINKS.map(({ to, label }) => (
            <li key={to}>
              <Link to={to} className="underline-offset-4 hover:underline">{label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-2 max-w-3xl">
        Statistical estimates for information only, not betting advice. Pitchside is independent and is not
        affiliated with the Premier League or any club.
      </p>
    </footer>
  );
}
