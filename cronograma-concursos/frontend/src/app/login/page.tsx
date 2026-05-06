"use client";

import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { API_BASE_URL } from "@/lib/api";
import { setAuth } from "@/lib/auth";

type LoginResponse = { token: string; username: string };

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loginMut = useMutation({
    // The shared `api` client redirects to /login on 401, which would loop
    // us. Use a bare axios call here instead.
    mutationFn: async () => {
      const res = await axios.post<LoginResponse>(
        `${API_BASE_URL}/auth/login`,
        { username, password },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setAuth(data.token, data.username);
      router.replace(next);
    },
  });

  const errorMsg = extractError(loginMut.error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!username || !password) return;
          loginMut.mutate();
        }}
        className="w-full max-w-sm bg-card border border-border-soft p-8 space-y-5"
      >
        <div>
          <p className="kicker">Cronograma Concursos · Ibero</p>
          <h1 className="font-serif text-3xl mt-2">Iniciar sesión</h1>
        </div>

        <label className="block">
          <span className="kicker block mb-1.5">Usuario</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
          />
        </label>

        <label className="block">
          <span className="kicker block mb-1.5">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
          />
        </label>

        <button
          type="submit"
          disabled={loginMut.isPending || !username || !password}
          className="w-full bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
        >
          {loginMut.isPending ? "Entrando..." : "Entrar"}
        </button>

        {errorMsg && <p className="text-xs text-danger">{errorMsg}</p>}
      </form>
    </div>
  );
}

function extractError(err: unknown): string | null {
  if (!err) return null;
  const anyErr = err as { response?: { status?: number; data?: { detail?: unknown } } };
  if (anyErr.response?.status === 401) {
    return "Usuario o contraseña incorrectos.";
  }
  const detail = anyErr.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return "No se pudo iniciar sesión.";
}
