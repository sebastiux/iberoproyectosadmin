"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Goal,
  Project,
  STATUS_COLORS,
  STATUS_LABELS,
  WeekGroup,
} from "@/types";
import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import Link from "next/link";
import { useEffect, useState } from "react";

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function fmtLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

function daysFromToday(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default function PlanningPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_date: "",
    project_id: "",
  });
  const [showForm, setShowForm] = useState(false);

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => (await api.get("/goals")).data,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects/")).data,
  });

  const { data: upcoming = [] } = useQuery<WeekGroup[]>({
    queryKey: ["upcoming", 60],
    queryFn: async () => (await api.get("/tasks/upcoming?days=60&limit=30")).data,
  });

  const projectName = (id: number | null) =>
    id == null ? null : projects.find((p) => p.id === id)?.name ?? null;

  const createGoal = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        target_date: form.target_date || null,
        project_id: form.project_id ? Number(form.project_id) : null,
      };
      return (await api.post("/goals", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setForm({ title: "", description: "", target_date: "", project_id: "" });
      setShowForm(false);
    },
  });

  const updateGoal = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Goal> }) =>
      (await api.patch(`/goals/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => api.delete(`/goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  const pending = goals.filter((g) => !g.achieved);
  const achieved = goals.filter((g) => g.achieved);
  const overdue = pending.filter(
    (g) => g.target_date && daysFromToday(g.target_date) < 0,
  );

  const upcomingTotal = upcoming.reduce((a, g) => a + g.tasks.length, 0);

  return (
    <div className="space-y-12">
      <header>
        <p className="kicker">Planeación</p>
        <h1 className="font-serif text-5xl mt-2 tracking-tight">Punto de Partida</h1>
        <p className="mt-2 text-sm text-muted">
          Metas a futuro y radar de hitos de los próximos 60 días.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Metas activas" value={pending.length} />
        <Metric label="Cumplidas" value={achieved.length} />
        <Metric label="Vencidas" value={overdue.length} accent={overdue.length > 0} />
        <Metric label="Hitos próx. 60 días" value={upcomingTotal} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Metas del equipo</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 border border-border bg-card hover:border-foreground px-3 py-2 text-sm transition-colors"
          >
            <PlusIcon
              size={15}
              className={`transition-transform ${showForm ? "rotate-45" : ""}`}
            />
            {showForm ? "Cancelar" : "Nueva meta"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              createGoal.mutate();
            }}
            className="bg-card border border-border-soft p-5 space-y-4"
          >
            <div className="grid md:grid-cols-4 gap-3">
              <input
                className="md:col-span-2 border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Título de la meta"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
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
              className="w-full border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
              rows={2}
              placeholder="Descripción / objetivo concreto"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <button
              type="submit"
              disabled={createGoal.isPending || !form.title.trim()}
              className="bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
            >
              {createGoal.isPending ? "Guardando..." : "Guardar meta"}
            </button>
          </form>
        )}

        {pending.length === 0 && achieved.length === 0 ? (
          <div className="bg-card border border-border-soft p-6 text-sm text-muted">
            Aún no hay metas. Empieza con una meta concreta y medible — por
            ejemplo: «Cerrar registro Huawei antes del 15 de mayo».
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <GoalGroup
                heading="En curso"
                goals={pending}
                projectName={projectName}
                onToggle={(g) =>
                  updateGoal.mutate({ id: g.id, patch: { achieved: !g.achieved } })
                }
                onEdit={(id, patch) => updateGoal.mutate({ id, patch })}
                onDelete={(id) => deleteGoal.mutate(id)}
              />
            )}
            {achieved.length > 0 && (
              <GoalGroup
                heading="Cumplidas"
                goals={achieved}
                projectName={projectName}
                onToggle={(g) =>
                  updateGoal.mutate({ id: g.id, patch: { achieved: !g.achieved } })
                }
                onEdit={(id, patch) => updateGoal.mutate({ id, patch })}
                onDelete={(id) => deleteGoal.mutate(id)}
                muted
              />
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Próximos hitos</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted bg-card border border-border-soft p-6">
            No hay tareas pendientes con fecha en los próximos 60 días.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((g) => (
              <article
                key={g.project_id}
                className="bg-card border border-border-soft p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/projects/${g.project_id}`}
                    className="font-serif text-xl hover:underline"
                  >
                    {g.project_name}
                  </Link>
                  <span className="text-xs text-muted">
                    {g.tasks.length} {g.tasks.length === 1 ? "hito" : "hitos"}
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-border-soft">
                  {g.tasks.map((t) => {
                    const days = t.end_date ? daysFromToday(t.end_date) : null;
                    return (
                      <li
                        key={t.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate">{t.name}</p>
                          <p className="text-[11px] text-muted mt-0.5">
                            {t.end_date && `${fmtLong(t.end_date)}`}
                            {days !== null && (
                              <>
                                <span className="mx-1.5">·</span>
                                {days === 0 && "hoy"}
                                {days > 0 && `en ${days} ${days === 1 ? "día" : "días"}`}
                                {days < 0 && `hace ${-days} ${-days === 1 ? "día" : "días"}`}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${STATUS_COLORS[t.effective_status]}`}
                        >
                          {STATUS_LABELS[t.effective_status]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GoalGroup({
  heading,
  goals,
  projectName,
  onToggle,
  onEdit,
  onDelete,
  muted = false,
}: {
  heading: string;
  goals: Goal[];
  projectName: (id: number | null) => string | null;
  onToggle: (g: Goal) => void;
  onEdit: (id: number, patch: Partial<Goal>) => void;
  onDelete: (id: number) => void;
  muted?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="kicker">
        {heading} · {goals.length}
      </p>
      <ul className="bg-card border border-border-soft divide-y divide-border-soft">
        {goals.map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            project={projectName(g.project_id)}
            onToggle={() => onToggle(g)}
            onEdit={(patch) => onEdit(g.id, patch)}
            onDelete={() => onDelete(g.id)}
            muted={muted}
          />
        ))}
      </ul>
    </div>
  );
}

function GoalRow({
  goal,
  project,
  onToggle,
  onEdit,
  onDelete,
  muted,
}: {
  goal: Goal;
  project: string | null;
  onToggle: () => void;
  onEdit: (patch: Partial<Goal>) => void;
  onDelete: () => void;
  muted: boolean;
}) {
  const days = goal.target_date ? daysFromToday(goal.target_date) : null;
  const overdue = !goal.achieved && days !== null && days < 0;

  return (
    <li className={`p-4 flex items-start gap-4 ${muted ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 h-5 w-5 shrink-0 border rounded transition-colors flex items-center justify-center ${
          goal.achieved
            ? "bg-foreground border-foreground text-background"
            : "border-border hover:border-foreground"
        }`}
        aria-label={goal.achieved ? "Marcar pendiente" : "Marcar cumplida"}
        title={goal.achieved ? "Marcar pendiente" : "Marcar cumplida"}
      >
        {goal.achieved && <CheckIcon size={12} />}
      </button>

      <div className="flex-1 min-w-0">
        <EditableTitle
          value={goal.title}
          onCommit={(v) => v && v !== goal.title && onEdit({ title: v })}
          achieved={goal.achieved}
        />
        {goal.description && (
          <p className="mt-1 text-sm text-muted">{goal.description}</p>
        )}
        <p className="mt-1.5 text-[11px] text-kicker uppercase tracking-[0.18em] flex items-center gap-2">
          {goal.target_date ? (
            <>
              <span className={overdue ? "text-danger" : ""}>
                {fmtLong(goal.target_date)}
                {days !== null && (
                  <span className="ml-1.5 normal-case tracking-normal">
                    ·{" "}
                    {days === 0 && "hoy"}
                    {days > 0 && `en ${days} ${days === 1 ? "día" : "días"}`}
                    {days < 0 && `hace ${-days} ${-days === 1 ? "día" : "días"}`}
                  </span>
                )}
              </span>
            </>
          ) : (
            <span>Sin fecha</span>
          )}
          {project && (
            <>
              <span aria-hidden>·</span>
              <span className="normal-case tracking-normal text-muted">{project}</span>
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          confirm(`¿Eliminar la meta "${goal.title}"?`) && onDelete()
        }
        className="text-muted hover:text-danger transition-colors p-2 shrink-0"
        aria-label="Eliminar meta"
      >
        <TrashIcon size={15} />
      </button>
    </li>
  );
}

function EditableTitle({
  value,
  onCommit,
  achieved,
}: {
  value: string;
  onCommit: (v: string) => void;
  achieved: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full bg-transparent text-base font-medium focus:outline-none focus:border-b focus:border-foreground -mx-0.5 px-0.5 ${
        achieved ? "line-through text-muted" : "text-foreground"
      }`}
    />
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border-soft p-5">
      <p className="kicker">{label}</p>
      <p
        className={`font-serif text-4xl mt-3 ${accent ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
