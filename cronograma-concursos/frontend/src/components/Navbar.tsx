"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Cronograma Base" },
  { href: "/projects", label: "Proyectos" },
  { href: "/planning", label: "Punto de Partida" },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
        <span className="font-semibold text-lg">Cronograma Concursos</span>
        <div className="flex gap-6">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm transition-colors ${active ? "text-black font-medium" : "text-gray-500 hover:text-black"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
