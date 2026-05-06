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
import { ChevronLeftIcon, PlusIcon, TrashIcon } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type TaskForm = {
  name: string;
  start_date: string;
  end_date: string;
  observations: string;
  complete: boolean;
};

const EMPTY_TASK: TaskForm = {
  name: "",
  start_date: "",
  end_date: "",
  observations: "",
  complete: false,
};

const STATUS_OPTIONS: TaskStatus[] = [
  "por_iniciar",
  "en_proceso",
  "atrasado",
  "completado",
];

type EstadoSelection = "auto" | TaskStatus;

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

  const { data: stepSuggestions = [] } = useQuery<string[]>({
    queryKey: ["step-suggestions"],
    queryFn: async () => (await api.get("/tasks/step-suggestions")).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["priority"] });
    qc.invalidateQueries({ queryKey: ["step-suggestions"] });
  };

  const createTask = useMutation({
    mutationFn: async (payload: TaskForm) => {
      const body = {
        project_id: projectId,
        name: payload.name,
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
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

  const updateProject = useMutation({
    mutationFn: async (patch: {
      name?: string;
      contact_name?: string | null;
      description?: string | null;
    }) => (await api.patch(`/projects/${projectId}`, patch)).data,
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
  const patchTask = (id: number, patch: Partial<Task>) =>
    updateTask.mutate({ id, patch });

  return (
    <div className="space-y-10">
      {/* Hoisted so inline table cells can use them even when the new-task
          form is collapsed. */}
      <datalist id="step-suggestions">
        {stepSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <header className="space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon size={14} />
          Proyectos
        </Link>
        <p className="kicker mt-4">Concurso</p>
        <HeaderEditable
          value={project.name}
          onCommit={(v) => v && v !== project.name && updateProject.mutate({ name: v })}
          className="font-serif text-5xl tracking-tight"
          placeholder="Nombre del concurso"
        />
        <div className="grid md:grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <LabeledInline label="Contacto">
            <HeaderEditable
              value={project.contact_name ?? ""}
              onCommit={(v) =>
                updateProject.mutate({ contact_name: v.trim() === "" ? null : v.trim() })
              }
              className="text-foreground"
              placeholder="Sin contacto"
            />
          </LabeledInline>
          <LabeledInline label="Tareas">
            <span className="text-muted">
              {project.tasks.length} {project.tasks.length === 1 ? "tarea" : "tareas"}
            </span>
          </LabeledInline>
          <LabeledInline label="Ficha de proyecto">
            <FichaUrl
              value={project.description ?? ""}
              onCommit={(v) =>
                updateProject.mutate({ description: v.trim() === "" ? null : v.trim() })
              }
            />
          </LabeledInline>
        </div>
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
            <Field
              label="Secuencia / Pasos"
              hint="Empieza a escribir para ver pasos usados en otros concursos."
            >
              <input
                list="step-suggestions"
                className="w-full border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
                placeholder="Ej. Alta de concurso en CRM"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="off"
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
                hint={
                  derivedDuration !== null
                    ? "Calculada a partir de las fechas"
                    : "Se calcula al fijar ambas fechas"
                }
              >
                <input
                  readOnly
                  value={derivedDuration !== null ? String(derivedDuration) : ""}
                  placeholder="—"
                  className="w-full border border-border-soft bg-transparent px-3 py-2.5 text-sm text-muted"
                />
              </Field>
            </div>

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

            <Field label="Notas">
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
              <th className="text-left px-5 py-3 font-normal">Hecho</th>
              <th className="text-left px-5 py-3 font-normal">Estado</th>
              <th className="text-left px-5 py-3 font-normal">Notas</th>
              <th className="text-right px-5 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {project.tasks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-muted">
                  Aún no hay tareas en este concurso.
                </td>
              </tr>
            )}
            {project.tasks.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="px-5 py-3.5">
                  <p>{t.name}</p>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <DateCell
                    value={t.start_date}
                    onCommit={(v) => patchTask(t.id, { start_date: v })}
                  />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <DateCell
                    value={t.end_date}
                    onCommit={(v) => patchTask(t.id, { end_date: v })}
                  />
                  <DurationCell
                    days={t.duration_days}
                    startDate={t.start_date}
                    endDate={t.end_date}
                    onCommit={(newDays) => {
                      // Editing the duration rewrites the end_date from
                      // start + N days so dates stay the source of truth.
                      if (!t.start_date) {
                        alert("Define primero la fecha de inicio.");
                        return;
                      }
                      const start = new Date(t.start_date + "T00:00:00");
                      start.setDate(start.getDate() + newDays);
                      const nextEnd = start.toISOString().slice(0, 10);
                      patchTask(t.id, { end_date: nextEnd, duration_days: newDays });
                    }}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={t.complete}
                    onChange={(e) =>
                      patchTask(t.id, { complete: e.target.checked })
                    }
                    className="accent-foreground"
                  />
                </td>
                <td className="px-5 py-3.5">
                  <EstadoSelect task={t} onChange={(patch) => patchTask(t.id, patch)} />
                </td>
                <td className="px-5 py-3.5 min-w-[180px]">
                  <NotesCell
                    value={t.observations ?? ""}
                    onCommit={(v) =>
                      patchTask(t.id, { observations: v.trim() === "" ? null : v })
                    }
                  />
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

/* ------------------------------- inline cells ------------------------------ */

function DateCell({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
}) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      className="bg-transparent text-sm text-muted focus:text-foreground focus:outline-none -mx-1 px-1 py-0.5"
    />
  );
}

function DurationCell({
  days,
  startDate,
  endDate,
  onCommit,
}: {
  days: number | null;
  startDate: string | null;
  endDate: string | null;
  onCommit: (days: number) => void;
}) {
  const [local, setLocal] = useState(days === null ? "" : String(days));
  useEffect(() => setLocal(days === null ? "" : String(days)), [days]);

  // If both dates exist, we can show something. Otherwise hide the cell.
  if (!startDate && !endDate && days === null) return null;

  const commit = () => {
    const parsed = Number(local);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setLocal(days === null ? "" : String(days));
      return;
    }
    if (parsed !== days) onCommit(parsed);
  };

  return (
    <div className="flex items-center gap-1 text-[11px] text-kicker mt-0.5">
      <input
        type="number"
        min={0}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-10 bg-transparent text-right focus:text-foreground focus:outline-none focus:border-b focus:border-foreground -my-0.5"
      />
      <span>d</span>
    </div>
  );
}

function HeaderEditable({
  value,
  onCommit,
  className = "",
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <input
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full bg-transparent placeholder:text-muted focus:outline-none focus:border-b focus:border-foreground -mx-0.5 px-0.5 ${className}`}
    />
  );
}

function FichaUrl({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const commit = () => {
    if (local !== value) onCommit(local);
    setEditing(false);
  };

  if (!editing && value) {
    return (
      <div className="flex items-center gap-3">
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2 truncate"
        >
          {value}
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] text-kicker hover:text-foreground transition-colors"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <input
      type="url"
      autoFocus={editing}
      value={local}
      placeholder="https://..."
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          setEditing(false);
        }
      }}
      className="w-full bg-transparent text-muted placeholder:text-muted focus:outline-none focus:border-b focus:border-foreground focus:text-foreground -mx-0.5 px-0.5"
    />
  );
}

function NotesCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <textarea
      rows={1}
      value={local}
      placeholder="Agregar notas..."
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      className="w-full bg-transparent text-xs text-muted placeholder:text-muted/60 focus:text-foreground focus:outline-none resize-y -mx-1 px-1 py-0.5 focus:border-b focus:border-foreground"
    />
  );
}

function LabeledInline({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="kicker self-center">{label}</span>
      <div>{children}</div>
    </>
  );
}

function EstadoSelect({
  task,
  onChange,
}: {
  task: Task;
  onChange: (patch: Partial<Task>) => void;
}) {
  const selectValue: EstadoSelection = task.auto_status ? "auto" : task.status ?? task.effective_status;

  const handle = (next: EstadoSelection) => {
    if (next === "auto") {
      onChange({ status: null, auto_status: true });
    } else {
      onChange({ status: next, auto_status: false });
    }
  };

  return (
    <select
      value={selectValue}
      onChange={(e) => handle(e.target.value as EstadoSelection)}
      className={`text-[11px] px-2.5 py-1 rounded border cursor-pointer ${STATUS_COLORS[task.effective_status]}`}
      title={task.auto_status ? "Calculado desde las fechas" : "Fijado manualmente"}
    >
      <option value="auto">
        Auto · {STATUS_LABELS[task.effective_status]}
      </option>
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
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
