"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ProjectSummary,
  RecalculateResult,
  STATUS_COLORS,
  STATUS_LABELS,
  Task,
  WeekGroup,
} from "@/types";
import { ChevronRightIcon, RefreshIcon } from "@/components/icons";
import Link from "next/link";

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

  const { data: weekGroups = [] } = useQuery<WeekGroup[]>({
    queryKey: ["week"],
    queryFn: async () => (await api.get("/tasks/week")).data,
  });

  const recalcMut = useMutation({
    mutationFn: async () =>
      (await api.post<RecalculateResult>("/tasks/recalculate-status")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["priority"] });
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });

  const weekRange =
    weekGroups[0] && `${fmtShort(weekGroups[0].week_start)} – ${fmtShort(weekGroups[0].week_end)}`;
  const weekTaskCount = weekGroups.reduce((a, g) => a + g.tasks.length, 0);

  const totalProjects = summaries.length;
  const totalCompleted = summaries.reduce((a, s) => a + s.completed_tasks, 0);
  const totalDelayed = summaries.reduce((a, s) => a + s.delayed_tasks, 0);
  const totalInProgress = summaries.reduce((a, s) => a + s.in_progress_tasks, 0);

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

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-2xl">Pendientes esta semana</h2>
          {weekRange && (
            <span className="text-xs text-muted">
              {weekRange} · {weekTaskCount} {weekTaskCount === 1 ? "tarea" : "tareas"}
            </span>
          )}
        </div>
        {weekGroups.length === 0 ? (
          <div className="bg-card border border-border-soft p-6 text-sm text-muted">
            Ninguna tarea pendiente con fecha de fin esta semana.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weekGroups.map((g) => (
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
                    {g.tasks.length} {g.tasks.length === 1 ? "tarea" : "tareas"}
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-border-soft">
                  {g.tasks.map((t) => (
                    <li
                      key={t.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate">{t.name}</p>
                        <p className="text-[11px] text-muted mt-0.5">
                          Fin: {t.end_date}
                          <span className="mx-1.5">·</span>
                          {t.responsible ?? "Sin responsable"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${STATUS_COLORS[t.effective_status]}`}
                      >
                        {STATUS_LABELS[t.effective_status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Progreso por concurso</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${s.id}`}
              className="group bg-card border border-border-soft hover:border-border transition-colors p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-xl">{s.name}</h3>
                <ChevronRightIcon
                  size={18}
                  className="text-muted group-hover:text-foreground transition-colors"
                />
              </div>
              <div className="mt-4 h-[3px] bg-border-soft overflow-hidden">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${s.completion_percent}%` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span>
                  {s.completed_tasks}/{s.total_tasks} tareas
                </span>
                <span>·</span>
                <span>{s.completion_percent}%</span>
                {s.delayed_tasks > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-danger">{s.delayed_tasks} atrasadas</span>
                  </>
                )}
              </div>
            </Link>
          ))}
          {summaries.length === 0 && (
            <p className="text-sm text-muted col-span-2">
              Aún no hay concursos. Crea uno desde la sección Proyectos.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]}`;
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
