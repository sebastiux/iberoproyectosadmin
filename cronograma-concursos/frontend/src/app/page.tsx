"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ProjectSummary,
  Task,
  RecalculateResult,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/types";
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

  const recalcMut = useMutation({
    mutationFn: async () =>
      (await api.post<RecalculateResult>("/tasks/recalculate-status")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["priority"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });

  const totalProjects = summaries.length;
  const totalCompleted = summaries.reduce((a, s) => a + s.completed_tasks, 0);
  const totalDelayed = summaries.reduce((a, s) => a + s.delayed_tasks, 0);
  const totalInProgress = summaries.reduce((a, s) => a + s.in_progress_tasks, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cronograma Base</h1>
          <p className="text-gray-500 text-sm mt-1">Vista general de todos los concursos.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => recalcMut.mutate()}
            disabled={recalcMut.isPending}
            className="bg-white border text-sm px-3 py-2 rounded hover:border-gray-400 disabled:opacity-50"
          >
            {recalcMut.isPending ? "Recalculando..." : "Recalcular semáforo"}
          </button>
          {recalcMut.isSuccess && (
            <span className="text-xs text-emerald-700">
              Actualizadas {recalcMut.data.updated}/{recalcMut.data.total_auto} tareas.
            </span>
          )}
          {recalcMut.isError && (
            <span className="text-xs text-red-600">No se pudo recalcular.</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Metric label="Concursos activos" value={totalProjects} />
        <Metric label="Tareas completadas" value={totalCompleted} accent="text-emerald-600" />
        <Metric label="En proceso" value={totalInProgress} accent="text-green-600" />
        <Metric label="Atrasadas" value={totalDelayed} accent="text-red-600" />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-4">Tareas prioritarias</h2>
        <div className="bg-white border rounded-lg divide-y">
          {priority.length === 0 && (
            <p className="p-6 text-sm text-gray-500">Sin tareas pendientes.</p>
          )}
          {priority.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t.end_date ? `Fin: ${t.end_date}` : "Sin fecha"} ·
                  {t.responsible ? ` ${t.responsible}` : " Sin responsable"}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}>
                {STATUS_LABELS[t.effective_status]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Progreso por concurso</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${s.id}`}
              className="bg-white border rounded-lg p-4 hover:border-gray-400 transition"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{s.name}</p>
                <span className="text-sm text-gray-500">{s.completion_percent}%</span>
              </div>
              <div className="mt-3 h-2 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${s.completion_percent}%` }}
                />
              </div>
              <div className="mt-3 flex gap-3 text-xs text-gray-500">
                <span>{s.completed_tasks}/{s.total_tasks} tareas</span>
                {s.delayed_tasks > 0 && (
                  <span className="text-red-600">{s.delayed_tasks} atrasadas</span>
                )}
              </div>
            </Link>
          ))}
          {summaries.length === 0 && (
            <p className="text-sm text-gray-500 col-span-2">
              Aun no hay concursos. Crea uno desde la seccion Proyectos.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent = "" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-semibold mt-2 ${accent}`}>{value}</p>
    </div>
  );
}
