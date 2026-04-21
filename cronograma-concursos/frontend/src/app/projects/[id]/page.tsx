"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Project,
  STATUS_COLORS,
  STATUS_LABELS,
  Task,
  TaskStatus,
} from "@/types";
import {
  ChevronLeftIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

type TaskForm = {
  name: string;
  start_date: string;
  end_date: string;
  responsible: string;
  observations: string;
  complete: boolean;
};

const EMPTY_TASK: TaskForm = {
  name: "",
  start_date: "",
  end_date: "",
  responsible: "",
  observations: "",
  complete: false,
};

const STATUS_OPTIONS: TaskStatus[] = [
  "por_iniciar",
  "en_proceso",
  "atrasado",
  "completado",
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const qc = useQueryClient();
  const [form, setForm] = useState<TaskForm>(EMPTY_TASK);
  const [showForm, setShowForm] = useState(true);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: Number.isFinite(projectId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["priority"] });
  };

  const createTask = useMutation({
    mutationFn: async (payload: TaskForm) => {
      const body = {
        project_id: projectId,
        name: payload.name,
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
        responsible: payload.responsible || null,
        observations: payload.observations || null,
        complete: payload.complete,
      };
      return (await api.post("/tasks/", body)).data;
    },
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_TASK);
    },
  });

  const derivedDuration =
    form.start_date && form.end_date
      ? Math.max(
          0,
          Math.round(
            (new Date(form.end_date).getTime() -
              new Date(form.start_date).getTime()) /
              86_400_000,
          ),
        )
      : null;

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Task> }) =>
      (await api.patch(`/tasks/${id}`, patch)).data,
    onSuccess: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: async (id: number) => api.delete(`/tasks/${id}`),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Cargando concurso...</p>;
  }
  if (!project) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Concurso no encontrado.</p>
        <Link href="/projects" className="text-sm underline">
          Volver a proyectos
        </Link>
      </div>
    );
  }

  const createErrorMsg = extractError(createTask.error);

  return (
    <div className="space-y-10">
      <header>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon size={14} />
          Proyectos
        </Link>
        <p className="kicker mt-4">Concurso</p>
        <h1 className="font-serif text-5xl mt-2 tracking-tight">{project.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {project.contact_name || "Sin contacto"}
          <span className="mx-2">·</span>
          {project.tasks.length} {project.tasks.length === 1 ? "tarea" : "tareas"}
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
          <span className="text-sm font-medium">Nueva tarea</span>
        </button>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name) return;
              createTask.mutate(form);
            }}
            className="mt-5 space-y-5"
          >
            <Field label="Secuencia / Pasos">
              <input
                className="w-full border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Ej. Alta de concurso en CRM"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Fecha de inicio">
                <input
                  type="date"
                  className="w-full border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </Field>
              <Field label="Fecha de fin">
                <input
                  type="date"
                  className="w-full border border-border bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </Field>
              <Field
                label="Duración (días)"
                hint={derivedDuration !== null ? "Calculada a partir de las fechas" : "Se calcula al fijar ambas fechas"}
              >
                <input
                  readOnly
                  value={derivedDuration !== null ? String(derivedDuration) : ""}
                  placeholder="—"
                  className="w-full border border-border-soft bg-transparent px-3 py-2.5 text-sm text-muted"
                />
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Responsable">
                <input
                  className="w-full border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                  placeholder="Nombre del responsable"
                  value={form.responsible}
                  onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                />
              </Field>
              <Field label="Completo">
                <label className="inline-flex items-center gap-2 px-3 py-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.complete}
                    onChange={(e) => setForm({ ...form, complete: e.target.checked })}
                    className="accent-foreground"
                  />
                  Marcar como completada
                </label>
              </Field>
            </div>

            <Field label="Observaciones">
              <textarea
                rows={2}
                className="w-full border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Notas, pendientes, tentativo, etc."
                value={form.observations}
                onChange={(e) => setForm({ ...form, observations: e.target.value })}
              />
            </Field>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={createTask.isPending || !form.name}
                className="bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
              >
                {createTask.isPending ? "Guardando..." : "Agregar tarea"}
              </button>
              {createErrorMsg && (
                <span className="text-xs text-danger">{createErrorMsg}</span>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="bg-card border border-border-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft text-[11px] uppercase tracking-[0.18em] text-kicker">
              <th className="text-left px-5 py-3 font-normal">Tarea</th>
              <th className="text-left px-5 py-3 font-normal">Inicio</th>
              <th className="text-left px-5 py-3 font-normal">Fin</th>
              <th className="text-left px-5 py-3 font-normal">Responsable</th>
              <th className="text-left px-5 py-3 font-normal">Hecho</th>
              <th className="text-left px-5 py-3 font-normal">Estado</th>
              <th className="text-left px-5 py-3 font-normal">Manual</th>
              <th className="text-right px-5 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {project.tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  Aún no hay tareas en este concurso.
                </td>
              </tr>
            )}
            {project.tasks.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p>{t.name}</p>
                  {t.observations && (
                    <p className="mt-1 text-xs text-muted">{t.observations}</p>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted whitespace-nowrap">
                  {t.start_date ?? "—"}
                </td>
                <td className="px-5 py-3.5 text-muted whitespace-nowrap">
                  {t.end_date ?? "—"}
                  {t.duration_days !== null && (
                    <span className="block text-[11px] text-kicker">
                      {t.duration_days} d
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted">{t.responsible ?? "—"}</td>
                <td className="px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={t.complete}
                    onChange={(e) =>
                      updateTask.mutate({ id: t.id, patch: { complete: e.target.checked } })
                    }
                    className="accent-foreground"
                  />
                </td>
                <td className="px-5 py-3.5">
                  {t.auto_status ? (
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}
                    >
                      {STATUS_LABELS[t.effective_status]}
                    </span>
                  ) : (
                    <select
                      value={t.status ?? t.effective_status}
                      onChange={(e) =>
                        updateTask.mutate({
                          id: t.id,
                          patch: {
                            status: e.target.value as TaskStatus,
                            auto_status: false,
                          },
                        })
                      }
                      className={`text-[11px] px-2.5 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <label className="inline-flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={!t.auto_status}
                      onChange={(e) =>
                        updateTask.mutate({
                          id: t.id,
                          patch: {
                            auto_status: !e.target.checked,
                            ...(e.target.checked
                              ? { status: t.effective_status }
                              : { status: null }),
                          },
                        })
                      }
                      className="accent-foreground"
                    />
                    Manual
                  </label>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      confirm(`¿Eliminar "${t.name}"?`) && deleteTask.mutate(t.id)
                    }
                    className="text-muted hover:text-danger transition-colors p-2"
                    aria-label={`Eliminar ${t.name}`}
                  >
                    <TrashIcon size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="kicker block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function extractError(err: unknown): string | null {
  if (!err) return null;
  const anyErr = err as { response?: { data?: { detail?: unknown } } };
  const detail = anyErr.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg.replace(/^Value error, /, "");
  }
  return "No se pudo guardar la tarea.";
}
