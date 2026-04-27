"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ProjectSummary,
  STATUS_COLORS,
  STATUS_LABELS,
  Task,
  WeeklyPlan,
  WeeklyPlanGenerated,
} from "@/types";
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from "@/components/icons";
import Link from "next/link";
import { useMemo, useState } from "react";

const WEEKDAY_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function todayMonday(): string {
  const d = new Date();
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function shiftMonday(iso: string, weeks: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function fmtRange(start: string, end: string): string {
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  return `${sd} ${MONTHS_ES[sm - 1]} – ${ed} ${MONTHS_ES[em - 1]}`;
}

function fmtDayHeader(iso: string, weekday: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${weekday} ${d} ${MONTHS_ES[m - 1]}`;
}

export function WeeklyPlanSection() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<string>(() => todayMonday());

  const { data: plan, isLoading } = useQuery<WeeklyPlan>({
    queryKey: ["weekly-plan", weekStart],
    queryFn: async () =>
      (await api.get(`/tasks/weekly-plan?week_start=${weekStart}`)).data,
  });

  // Cached alongside the rest of the dashboard — used to label each task
  // with its concurso name without changing the backend payload.
  const { data: summaries = [] } = useQuery<ProjectSummary[]>({
    queryKey: ["summary"],
    queryFn: async () => (await api.get("/projects/summary")).data,
  });
  const projectNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of summaries) m.set(s.id, s.name);
    return m;
  }, [summaries]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["weekly-plan"] });
    qc.invalidateQueries({ queryKey: ["week"] });
    qc.invalidateQueries({ queryKey: ["priority"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };

  const moveTask = useMutation({
    mutationFn: async ({ id, end_date }: { id: number; end_date: string }) =>
      (await api.patch(`/tasks/${id}`, { end_date })).data,
    onSuccess: invalidate,
  });

  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post<WeeklyPlanGenerated>(
          `/tasks/weekly-plan/generate?week_start=${weekStart}`,
        )
      ).data,
    onSuccess: invalidate,
  });

  const dayOptions = useMemo(
    () =>
      plan?.days.map((d, i) => ({
        value: d.date,
        label: `${WEEKDAY_ES[i]} ${d.date.slice(8, 10)}`,
      })) ?? [],
    [plan],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Plan semanal</h2>
          {plan && (
            <p className="text-xs text-muted mt-0.5">
              Semana del {fmtRange(plan.week_start, plan.week_end)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftMonday(w, -1))}
            className="p-2 border border-border bg-card hover:border-foreground transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeftIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(todayMonday())}
            className="px-3 py-2 text-sm border border-border bg-card hover:border-foreground transition-colors"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftMonday(w, 1))}
            className="p-2 border border-border bg-card hover:border-foreground transition-colors"
            aria-label="Semana siguiente"
          >
            <ChevronRightIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || (plan?.unscheduled.length ?? 0) === 0}
            className="flex items-center gap-2 ml-2 border border-border bg-card hover:border-foreground px-3 py-2 text-sm transition-colors disabled:opacity-40"
            title={
              (plan?.unscheduled.length ?? 0) === 0
                ? "No hay tareas sin fecha"
                : `Asignar ${plan?.unscheduled.length} tareas a esta semana`
            }
          >
            <RefreshIcon size={14} />
            Generar plan
          </button>
        </div>
      </div>

      {generate.isSuccess && (
        <p className="text-xs text-emerald-700">
          Se asignaron {generate.data.assigned} tareas a la semana del{" "}
          {fmtRange(generate.data.week_start, generate.data.week_end)}.
        </p>
      )}

      {isLoading && <p className="text-sm text-muted">Cargando plan...</p>}

      {plan && (
        <div className="bg-card border border-border-soft divide-y divide-border-soft">
          {plan.days.map((d, i) => (
            <div key={d.date} className="grid grid-cols-[110px_1fr] gap-4 p-4">
              <div className="kicker pt-1">{fmtDayHeader(d.date, WEEKDAY_ES[i])}</div>
              <div>
                {d.tasks.length === 0 ? (
                  <p className="text-xs text-muted italic">Sin tareas</p>
                ) : (
                  <ul className="space-y-2">
                    {d.tasks.map((t) => (
                      <PlanTaskRow
                        key={t.id}
                        task={t}
                        projectName={projectNames.get(t.project_id) ?? null}
                        days={dayOptions}
                        onMove={(date) => moveTask.mutate({ id: t.id, end_date: date })}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {plan && plan.unscheduled.length > 0 && (
        <details className="bg-card border border-border-soft p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Sin fecha · {plan.unscheduled.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {plan.unscheduled.slice(0, 30).map((t) => (
              <PlanTaskRow
                key={t.id}
                task={t}
                projectName={projectNames.get(t.project_id) ?? null}
                days={dayOptions}
                onMove={(date) => moveTask.mutate({ id: t.id, end_date: date })}
              />
            ))}
            {plan.unscheduled.length > 30 && (
              <li className="text-xs text-muted">
                ... y {plan.unscheduled.length - 30} más. Usa "Generar plan" para
                distribuirlas automáticamente.
              </li>
            )}
          </ul>
        </details>
      )}
    </section>
  );
}

function PlanTaskRow({
  task,
  projectName,
  days,
  onMove,
}: {
  task: Task;
  projectName: string | null;
  days: { value: string; label: string }[];
  onMove: (date: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{task.name}</p>
        <p className="text-[11px] text-muted mt-0.5 truncate">
          <Link
            href={`/projects/${task.project_id}`}
            className="hover:underline text-foreground"
          >
            {projectName ?? `Concurso #${task.project_id}`}
          </Link>
          <span className="mx-1.5">·</span>
          {task.responsible ?? "Sin responsable"}
        </p>
      </div>
      <select
        value={task.end_date ?? ""}
        onChange={(e) => onMove(e.target.value)}
        className="text-[11px] border border-border bg-transparent px-1.5 py-1 hover:border-foreground transition-colors"
        title="Mover a otro día"
      >
        {task.end_date && !days.some((d) => d.value === task.end_date) && (
          <option value={task.end_date}>{task.end_date}</option>
        )}
        {days.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <span
        className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${STATUS_COLORS[task.effective_status]}`}
      >
        {STATUS_LABELS[task.effective_status]}
      </span>
    </li>
  );
}
