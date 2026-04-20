"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Goal, Project } from "@/types";
import { useState } from "react";

export default function PlanningPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_date: "",
    project_id: "",
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => (await api.get("/goals")).data,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects/")).data,
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        target_date: form.target_date || null,
        project_id: form.project_id ? Number(form.project_id) : null,
      };
      return (await api.post("/goals", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setForm({ title: "", description: "", target_date: "", project_id: "" });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => api.delete(`/goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Punto de Partida</h1>
        <p className="text-gray-500 text-sm mt-1">
          Proyecciones a futuro y metas definidas por el equipo.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title) return;
          createGoal.mutate();
        }}
        className="bg-white border rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">Nueva meta</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <input
            className="border rounded px-3 py-2 text-sm md:col-span-2"
            placeholder="Titulo"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            value={form.target_date}
            onChange={(e) => setForm({ ...form, target_date: e.target.value })}
          />
          <select
            className="border rounded px-3 py-2 text-sm"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          >
            <option value="">Sin concurso vinculado</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="border rounded px-3 py-2 text-sm w-full"
          rows={2}
          placeholder="Descripcion / objetivo"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button
          type="submit"
          className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800"
        >
          Guardar meta
        </button>
      </form>

      <div className="bg-white border rounded-lg divide-y">
        {goals.length === 0 && (
          <p className="p-6 text-sm text-gray-500">Sin metas registradas.</p>
        )}
        {goals.map((g) => (
          <div key={g.id} className="p-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{g.title}</p>
              {g.description && (
                <p className="text-sm text-gray-600 mt-1">{g.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {g.target_date ? `Fecha objetivo: ${g.target_date}` : "Sin fecha"}
              </p>
            </div>
            <button
              onClick={() => deleteGoal.mutate(g.id)}
              className="text-sm text-red-600 hover:underline shrink-0"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
