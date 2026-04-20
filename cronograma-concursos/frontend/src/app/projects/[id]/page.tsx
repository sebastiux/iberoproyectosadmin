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
    return <p className="text-sm text-gray-500">Cargando concurso...</p>;
  }
  if (!project) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Concurso no encontrado.</p>
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">
          Volver a proyectos
        </Link>
      </div>
    );
  }

  const createError = createTask.error as { response?: { data?: { detail?: unknown } } } | null;
  const createErrorMsg = extractError(createError);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-gray-500 hover:underline">
          ← Proyectos
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{project.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {project.contact_name || "Sin contacto"} · {project.tasks.length} tareas
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name) return;
          createTask.mutate(form);
        }}
        className="bg-white border rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">Nueva tarea</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <input
            className="border rounded px-3 py-2 text-sm md:col-span-2"
            placeholder="Nombre de la tarea"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
        <input
          className="border rounded px-3 py-2 text-sm w-full"
          placeholder="Responsable"
          value={form.responsible}
          onChange={(e) => setForm({ ...form, responsible: e.target.value })}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createTask.isPending}
            className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-50"
          >
            {createTask.isPending ? "Guardando..." : "Agregar tarea"}
          </button>
          {createErrorMsg && (
            <span className="text-xs text-red-600">{createErrorMsg}</span>
          )}
        </div>
      </form>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left p-3">Tarea</th>
              <th className="text-left p-3">Inicio</th>
              <th className="text-left p-3">Fin</th>
              <th className="text-left p-3">Responsable</th>
              <th className="text-left p-3">Completo</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-left p-3">Override</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {project.tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Aún no hay tareas en este concurso.
                </td>
              </tr>
            )}
            {project.tasks.map((t) => (
              <tr key={t.id}>
                <td className="p-3">{t.name}</td>
                <td className="p-3 text-gray-600">{t.start_date ?? "—"}</td>
                <td className="p-3 text-gray-600">{t.end_date ?? "—"}</td>
                <td className="p-3 text-gray-600">{t.responsible ?? "—"}</td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={t.complete}
                    onChange={(e) =>
                      updateTask.mutate({ id: t.id, patch: { complete: e.target.checked } })
                    }
                  />
                </td>
                <td className="p-3">
                  {t.auto_status ? (
                    <span
                      className={`text-xs px-2 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}
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
                      className={`text-xs px-2 py-1 rounded border ${STATUS_COLORS[t.effective_status]}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="p-3">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600">
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
                    />
                    Manual
                  </label>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() =>
                      confirm(`Eliminar "${t.name}"?`) && deleteTask.mutate(t.id)
                    }
                    className="text-xs text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function extractError(err: { response?: { data?: { detail?: unknown } } } | null): string | null {
  if (!err) return null;
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg.replace(/^Value error, /, "");
  }
  return "No se pudo guardar la tarea.";
}
