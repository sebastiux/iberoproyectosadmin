"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ImportExcelResult, Project } from "@/types";
import Link from "next/link";
import { useRef, useState } from "react";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", contact_name: "", description: "" });
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

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos</h1>
          <p className="text-gray-500 text-sm mt-1">Administra los concursos y sus tareas.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
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
            className="bg-white border text-sm px-3 py-2 rounded hover:border-gray-400 disabled:opacity-50"
          >
            {importMut.isPending ? "Importando..." : "Importar desde Excel"}
          </button>
          {importMut.isSuccess && (
            <span className="text-xs text-emerald-700">
              {importMut.data.projects_created} concursos · {importMut.data.tasks_created} tareas
              {importMut.data.skipped_rows > 0 && ` · ${importMut.data.skipped_rows} omitidas`}
            </span>
          )}
          {importMut.isError && (
            <span className="text-xs text-red-600">
              No se pudo importar el archivo.
            </span>
          )}
        </div>
      </div>

      {importMut.isSuccess && importMut.data.errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
          <p className="font-medium">Advertencias durante la importación:</p>
          {importMut.data.errors.slice(0, 10).map((err, i) => (
            <p key={i}>· {err}</p>
          ))}
          {importMut.data.errors.length > 10 && (
            <p>· ...y {importMut.data.errors.length - 10} más.</p>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name) return;
          createMut.mutate(form);
        }}
        className="bg-white border rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">Nuevo concurso</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="border rounded px-3 py-2 text-sm"
            placeholder="Nombre (ej. Huawei Innovation)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="border rounded px-3 py-2 text-sm"
            placeholder="Contacto"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
          <input
            className="border rounded px-3 py-2 text-sm"
            placeholder="Descripcion"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={createMut.isPending}
          className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-50"
        >
          {createMut.isPending ? "Creando..." : "Crear concurso"}
        </button>
      </form>

      <div className="bg-white border rounded-lg divide-y">
        {projects.length === 0 && (
          <p className="p-6 text-sm text-gray-500">Sin proyectos todavia.</p>
        )}
        {projects.map((p) => (
          <div key={p.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <p className="text-xs text-gray-500 mt-1">
                {p.contact_name || "Sin contacto"} · {p.tasks.length} tareas
              </p>
            </div>
            <button
              onClick={() => confirm(`Eliminar "${p.name}"?`) && deleteMut.mutate(p.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
