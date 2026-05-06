"use client";

import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { API_BASE_URL } from "@/lib/api";
import { setAuth } from "@/lib/auth";

type LoginResponse = {
  token: string | null;
  username: string | null;
  requires_code: boolean;
  challenge_id: string | null;
  email_hint: string | null;
  message: string | null;
};

type VerifyResponse = { token: string; username: string };

type Stage =
  | { step: "credentials" }
  | { step: "code"; challengeId: string; emailHint: string | null; username: string };

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>({ step: "credentials" });

  const loginMut = useMutation({
    mutationFn: async () => {
      const res = await axios.post<LoginResponse>(
        `${API_BASE_URL}/auth/login`,
        { username, password },
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data.requires_code && data.challenge_id) {
        setStage({
          step: "code",
          challengeId: data.challenge_id,
          emailHint: data.email_hint,
          username,
        });
        setCode("");
      } else if (data.token && data.username) {
        setAuth(data.token, data.username);
        router.replace(next);
      }
    },
  });

  const verifyMut = useMutation({
    mutationFn: async () => {
      if (stage.step !== "code") throw new Error("bad stage");
      const res = await axios.post<VerifyResponse>(
        `${API_BASE_URL}/auth/verify-code`,
        { challenge_id: stage.challengeId, code: code.trim() },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setAuth(data.token, data.username);
      router.replace(next);
    },
  });

  const errorMsg = extractError(loginMut.error) || extractError(verifyMut.error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      {stage.step === "credentials" ? (
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
            {loginMut.isPending ? "Verificando..." : "Continuar"}
          </button>

          {errorMsg && <p className="text-xs text-danger">{errorMsg}</p>}
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length < 4) return;
            verifyMut.mutate();
          }}
          className="w-full max-w-sm bg-card border border-border-soft p-8 space-y-5"
        >
          <div>
            <p className="kicker">Confirmación por correo</p>
            <h1 className="font-serif text-3xl mt-2">Ingresa tu código</h1>
            <p className="mt-2 text-sm text-muted">
              Te enviamos un código de 6 dígitos
              {stage.emailHint ? ` a ${stage.emailHint}` : ""}.
              Expira en 10 minutos.
            </p>
          </div>

          <label className="block">
            <span className="kicker block mb-1.5">Código</span>
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full border border-border bg-transparent px-3 py-2.5 text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-foreground transition-colors"
            />
          </label>

          <button
            type="submit"
            disabled={verifyMut.isPending || code.trim().length < 4}
            className="w-full bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
          >
            {verifyMut.isPending ? "Validando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStage({ step: "credentials" });
              setCode("");
            }}
            className="w-full text-xs text-muted hover:text-foreground transition-colors"
          >
            ← Usar otro usuario
          </button>

          {errorMsg && <p className="text-xs text-danger">{errorMsg}</p>}
        </form>
      )}
    </div>
  );
}

function extractError(err: unknown): string | null {
  if (!err) return null;
  const anyErr = err as {
    response?: { status?: number; data?: { detail?: unknown } };
  };
  const detail = anyErr.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (anyErr.response?.status === 401) return "Credenciales o código inválidos.";
  if (anyErr.response?.status === 502)
    return "No se pudo enviar el código por correo. Intenta de nuevo.";
  return "No se pudo iniciar sesión.";
}
