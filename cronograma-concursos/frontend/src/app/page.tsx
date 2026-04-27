"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ProjectSummary,
  RecalculateResult,
  STATUS_COLORS,
  STATUS_LABELS,
  Task,
} from "@/types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon,
} from "@/components/icons";
import { WeeklyPlanSection } from "@/components/WeeklyPlanSection";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 6;

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: summaries = [] } = useQuery<ProjectSummary[]>({
    queryKey: ["summary"],
    queryFn: async () => (await api.get("/projects/summary")).data,
  });

  const { data: priority = [] } = useQuery<Task[]>({
    queryKey: ["priority"],
    queryFn: async () => (await api.get("/tasks/priority?limit=8")).data,
  });

  const recalcMut = useMutation({
    mutationFn: async () =>
      (await api.post<RecalculateResult>("/tasks/recalculate-status")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["priority"] });
      qc.invalidateQueries({ queryKey: ["weekly-plan"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });

  const totalProjects = summaries.length;
  const totalCompleted = summaries.reduce((a, s) => a + s.completed_tasks, 0);
  const totalDelayed = summaries.reduce((a, s) => a + s.delayed_tasks, 0);
  const totalInProgress = summaries.reduce((a, s) => a + s.in_progress_tasks, 0);

  // Sort: atrasadas first, then by least-progressed, so the monitor surfaces
  // the concursos that need attention up top.
  const ordered = useMemo(() => {
    return [...summaries].sort((a, b) => {
      if (b.delayed_tasks !== a.delayed_tasks) return b.delayed_tasks - a.delayed_tasks;
      if (a.completion_percent !== b.completion_percent)
        return a.completion_percent - b.completion_percent;
      return a.name.localeCompare(b.name);
    });
  }, [summaries]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = ordered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-12">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="kicker">Panorama</p>
          <h1 className="font-serif text-5xl mt-2 tracking-tight">Cronograma Base</h1>
          <p className="mt-2 text-sm text-muted">
            Vista general de todos los concursos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => recalcMut.mutate()}
            disabled={recalcMut.isPending}
            className="flex items-center gap-2 border border-border bg-card hover:border-foreground px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshIcon size={15} />
            {recalcMut.isPending ? "Recalculando..." : "Recalcular semáforo"}
          </button>
          {recalcMut.isSuccess && (
            <span className="text-xs text-muted">
              Actualizadas {recalcMut.data.updated}/{recalcMut.data.total_auto} tareas.
            </span>
          )}
          {recalcMut.isError && (
            <span className="text-xs text-danger">No se pudo recalcular.</span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Concursos activos" value={totalProjects} />
        <Metric label="Completadas" value={totalCompleted} />
        <Metric label="En proceso" value={totalInProgress} />
        <Metric label="Atrasadas" value={totalDelayed} accent />
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Tareas prioritarias</h2>
        <div className="bg-card border border-border-soft divide-y divide-border-soft">
          {priority.length === 0 && (
            <p className="p-6 text-sm text-muted">Sin tareas pendientes.</p>
          )}
          {priority.map((t) => (
            <div key={t.id} className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted mt-1">
                  {t.end_date ? `Fin: ${t.end_date}` : "Sin fecha"}
                  <span className="mx-2">·</span>
                  {t.responsible ?? "Sin responsable"}
                </p>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}
              >
                {STATUS_LABELS[t.effective_status]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <WeeklyPlanSection />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">Avances por concurso</h2>
            <p className="text-xs text-muted mt-0.5">
              Monitor general · ordenados por atención requerida.
            </p>
          </div>
          {ordered.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted mx-1">
                {safePage * PAGE_SIZE + 1}–
                {Math.min(ordered.length, (safePage + 1) * PAGE_SIZE)} de{" "}
                {ordered.length}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="p-2 border border-border bg-card hover:border-foreground disabled:opacity-40 disabled:hover:border-border transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeftIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="p-2 border border-border bg-card hover:border-foreground disabled:opacity-40 disabled:hover:border-border transition-colors"
                aria-label="Página siguiente"
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {ordered.length === 0 ? (
          <div className="bg-card border border-border-soft p-6 text-sm text-muted">
            Aún no hay concursos.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visible.map((s) => (
              <ProjectMonitorCard key={s.id} summary={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectMonitorCard({ summary }: { summary: ProjectSummary }) {
  const remaining = summary.total_tasks - summary.completed_tasks;
  const showAccent = summary.delayed_tasks > 0;

  return (
    <Link
      href={`/projects/${summary.id}`}
      className="group bg-card border border-border-soft hover:border-foreground transition-colors p-5 flex flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-xl truncate">{summary.name}</h3>
          {summary.contact_name && (
            <p className="text-xs text-muted mt-0.5 truncate">
              {summary.contact_name}
            </p>
          )}
        </div>
        <ChevronRightIcon
          size={20}
          className="shrink-0 text-muted group-hover:text-foreground transition-transform group-hover:translate-x-0.5 mt-1"
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between text-xs text-muted">
        <span>
          {summary.completed_tasks}/{summary.total_tasks} tareas
        </span>
        <span className={`font-medium ${showAccent ? "text-danger" : "text-foreground"}`}>
          {summary.completion_percent}%
        </span>
      </div>
      <div className="mt-1.5 h-[3px] bg-border-soft overflow-hidden">
        <div
          className={`h-full ${showAccent ? "bg-danger" : "bg-foreground"}`}
          style={{ width: `${summary.completion_percent}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <Stat
          label="En proceso"
          value={summary.in_progress_tasks}
          tone={summary.in_progress_tasks > 0 ? "amber" : "muted"}
        />
        <Stat
          label="Atrasadas"
          value={summary.delayed_tasks}
          tone={summary.delayed_tasks > 0 ? "red" : "muted"}
        />
        <Stat label="Pendientes" value={remaining} tone="muted" />
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-300 bg-red-50 text-red-900"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-border-soft bg-background text-muted";
  return (
    <div className={`border ${toneClass} px-2 py-1.5`}>
      <p className="kicker text-[9px] tracking-[0.18em]">{label}</p>
      <p className="text-base font-medium leading-tight mt-0.5">{value}</p>
    </div>
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
