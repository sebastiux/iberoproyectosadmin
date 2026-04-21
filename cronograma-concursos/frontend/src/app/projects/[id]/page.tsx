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
};

const EMPTY_TASK: TaskForm = {
  name: "",
  start_date: "",
  end_date: "",
  responsible: "",
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
      };
      return (await api.post("/tasks/", body)).data;
    },
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_TASK);
    },
  });

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
            className="mt-5 space-y-4"
          >
            <div className="grid md:grid-cols-4 gap-3">
              <input
                className="md:col-span-2 border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Nombre de la tarea"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                type="date"
                className="border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              <input
                type="date"
                className="border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <input
              className="border border-border bg-transparent px-3 py-2.5 text-sm w-full placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
              placeholder="Responsable"
              value={form.responsible}
              onChange={(e) => setForm({ ...form, responsible: e.target.value })}
            />
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
              <tr key={t.id} className="align-middle">
                <td className="px-5 py-3.5">{t.name}</td>
                <td className="px-5 py-3.5 text-muted">{t.start_date ?? "—"}</td>
                <td className="px-5 py-3.5 text-muted">{t.end_date ?? "—"}</td>
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
