"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ImportExcelResult, Project } from "@/types";
import {
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import Link from "next/link";
import { useRef, useState } from "react";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", contact_name: "", description: "" });
  const [showForm, setShowForm] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects/")).data,
  });

  const createMut = useMutation({
    mutationFn: async (payload: typeof form) => (await api.post("/projects/", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setForm({ name: "", contact_name: "", description: "" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<ImportExcelResult>(
        "/projects/import-excel",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["priority"] });
    },
  });

  const count = projects.length;

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="kicker">Administración</p>
          <h1 className="font-serif text-5xl mt-2 tracking-tight">Proyectos</h1>
          <p className="mt-2 text-sm text-muted">
            {count} {count === 1 ? "concurso registrado" : "concursos registrados"}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importMut.mutate(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMut.isPending}
            className="flex items-center gap-2 border border-border bg-card hover:border-foreground px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            <UploadIcon size={15} />
            {importMut.isPending ? "Importando..." : "Importar desde Excel"}
          </button>
          {importMut.isSuccess && (
            <span className="text-xs text-muted">
              {importMut.data.projects_created} concursos · {importMut.data.tasks_created} tareas
              {importMut.data.skipped_rows > 0 && ` · ${importMut.data.skipped_rows} omitidas`}
            </span>
          )}
          {importMut.isError && (
            <span className="text-xs text-danger">No se pudo importar el archivo.</span>
          )}
        </div>
      </header>

      {importMut.isSuccess && importMut.data.errors.length > 0 && (
        <div className="bg-card border border-border-soft p-4 text-xs text-muted space-y-1">
          <p className="font-medium text-foreground">Advertencias durante la importación:</p>
          {importMut.data.errors.slice(0, 10).map((err, i) => (
            <p key={i}>· {err}</p>
          ))}
          {importMut.data.errors.length > 10 && (
            <p>· ...y {importMut.data.errors.length - 10} más.</p>
          )}
        </div>
      )}

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
          <span className="text-sm font-medium">Nuevo concurso</span>
        </button>
        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name) return;
              createMut.mutate(form);
            }}
            className="mt-5 space-y-4"
          >
            <div className="grid md:grid-cols-3 gap-3">
              <TextInput
                placeholder="Nombre del concurso"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <TextInput
                placeholder="Contacto de la carrera"
                value={form.contact_name}
                onChange={(v) => setForm({ ...form, contact_name: v })}
              />
              <TextInput
                placeholder="Liga a ficha de proyecto (URL)"
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
              />
            </div>
            <button
              type="submit"
              disabled={createMut.isPending || !form.name}
              className="bg-foreground text-background hover:opacity-90 px-5 py-2.5 text-sm transition-opacity disabled:opacity-40"
            >
              {createMut.isPending ? "Creando..." : "Crear concurso"}
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        {projects.length === 0 && (
          <p className="text-sm text-muted">Sin proyectos todavía.</p>
        )}
        {projects.map((p) => (
          <article
            key={p.id}
            className="group bg-card border border-border-soft hover:border-border transition-colors p-5 flex items-center gap-4"
          >
            <Link href={`/projects/${p.id}`} className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-xl">{p.name}</h3>
                <ChevronRightIcon
                  size={18}
                  className="text-muted group-hover:text-foreground transition-colors"
                />
              </div>
              <p className="mt-1 text-sm text-muted">
                {p.contact_name || "Sin contacto"}
                <span className="mx-2">·</span>
                {p.tasks.length} {p.tasks.length === 1 ? "tarea" : "tareas"}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => confirm(`¿Eliminar "${p.name}"?`) && deleteMut.mutate(p.id)}
              className="text-muted hover:text-danger transition-colors p-2"
              aria-label={`Eliminar ${p.name}`}
            >
              <TrashIcon size={16} />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border border-border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-foreground transition-colors"
    />
  );
}
