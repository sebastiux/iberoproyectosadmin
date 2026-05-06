"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onLogin = pathname?.startsWith("/login");

  return (
    <>
      {!onLogin && <Navbar />}
      <main className="max-w-6xl mx-auto px-6 py-12">{children}</main>
    </>
  );
}
