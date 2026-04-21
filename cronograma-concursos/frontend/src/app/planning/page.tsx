"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Goal, Project } from "@/types";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { useState } from "react";

export default function PlanningPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_date: "",
    project_id: "",
  });
  const [showForm, setShowForm] = useState(true);

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => (await api.get("/goals")).data,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects/")).data,
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        target_date: form.target_date || null,
        project_id: form.project_id ? Number(form.project_id) : null,
      };
      return (await api.post("/goals", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setForm({ title: "", description: "", target_date: "", project_id: "" });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => api.delete(`/goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  return (
    <div className="space-y-10">
      <header>
        <p className="kicker">Planeación</p>
        <h1 className="font-serif text-5xl mt-2 tracking-tight">Punto de Partida</h1>
        <p className="mt-2 text-sm text-muted">
          Proyecciones a futuro y metas definidas por el equipo.
        </p>
      </header>

      <section className="bg-card border border-border-soft p-6">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-3 text-foreground"
        >
          <PlusIcon
            size={18}
            className={`transition-transform ${showForm ? "rotate-45" : ""}`}
          />
          <span className="text-sm font-medium">Nueva meta</span>
        </button>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title) return;
              createGoal.mutate();
            }}
            className="mt-5 space-y-4"
          >
            <div className="grid md:grid-cols-4 gap-3">
              <input
                className="md:col-span-2 border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Título"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <input
                type="date"
                className="border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
              <select
                className="border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">Sin concurso vinculado</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="border border-border bg-transparent px-3 py-2.5 text-sm w-full placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
              rows={2}
              placeholder="Descripción / objetivo"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <button
              type="submit"
              disabled={createGoal.isPending || !form.title}
              className="bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
            >
              {createGoal.isPending ? "Guardando..." : "Guardar meta"}
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        {goals.length === 0 && (
          <p className="text-sm text-muted">Sin metas registradas.</p>
        )}
        {goals.map((g) => (
          <article
            key={g.id}
            className="bg-card border border-border-soft p-5 flex items-start justify-between gap-4"
          >
            <div>
              <h3 className="font-serif text-xl">{g.title}</h3>
              {g.description && (
                <p className="mt-2 text-sm text-muted">{g.description}</p>
              )}
              <p className="mt-2 text-xs text-kicker uppercase tracking-[0.18em]">
                {g.target_date ? `Fecha objetivo · ${g.target_date}` : "Sin fecha"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => deleteGoal.mutate(g.id)}
              className="text-muted hover:text-danger transition-colors p-2 shrink-0"
              aria-label={`Eliminar ${g.title}`}
            >
              <TrashIcon size={16} />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
