"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Project } from "@/types";
import Link from "next/link";
import { useState } from "react";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", contact_name: "", description: "" });

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Proyectos</h1>
        <p className="text-gray-500 text-sm mt-1">Administra los concursos y sus tareas.</p>
      </div>

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
