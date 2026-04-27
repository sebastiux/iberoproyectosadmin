"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Cronograma Base" },
  { href: "/projects", label: "Proyectos" },
];

// Until auth ships, we surface a single operator name. Swap this for the
// logged-in user once login exists.
const CURRENT_USER = "Carlos Ortega";

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatToday() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

export function Navbar() {
  const pathname = usePathname();
  const [today, setToday] = useState("");

  // Format on the client to avoid hydration mismatches from timezone drift.
  useEffect(() => setToday(formatToday()), []);

  return (
    <nav className="border-b border-border-soft bg-background">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-10">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <span className="inline-flex h-9 w-9 items-center justify-center bg-foreground text-background font-serif text-lg leading-none">
            C
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-xl">Cronograma</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-kicker">
              Concursos · Ibero
            </span>
          </span>
        </Link>

        <div className="flex gap-8 ml-auto mr-auto">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative text-sm py-1 transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
                {active && (
                  <span className="absolute -bottom-px left-0 right-0 h-px bg-foreground" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm text-foreground">{CURRENT_USER}</p>
          <p className="text-xs text-muted mt-0.5">{today || " "}</p>
        </div>
      </div>
    </nav>
  );
}
