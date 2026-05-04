export type TaskStatus = "completado" | "en_proceso" | "por_iniciar" | "atrasado";

export interface Task {
  id: number;
  project_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  complete: boolean;
  responsible: string | null;
  observations: string | null;
  status: TaskStatus | null;
  auto_status: boolean;
  effective_status: TaskStatus;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  contact_name: string | null;
  description: string | null;
  observations: string | null;
  created_at: string;
  updated_at: string;
  tasks: Task[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  contact_name: string | null;
  total_tasks: number;
  completed_tasks: number;
  delayed_tasks: number;
  in_progress_tasks: number;
  completion_percent: number;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  target_date: string | null;
  project_id: number | null;
  achieved: boolean;
  created_at: string;
}

export interface RecalculateResult {
  updated: number;
  total_auto: number;
}

export interface ImportExcelResult {
  projects_created: number;
  projects_updated: number;
  tasks_created: number;
  tasks_updated: number;
  tasks_deleted: number;
  skipped_rows: number;
  errors: string[];
}

export interface WeekGroup {
  project_id: number;
  project_name: string;
  week_start: string;
  week_end: string;
  tasks: Task[];
}

export interface WeeklyPlanDay {
  date: string;
  tasks: Task[];
}

export interface WeeklyPlan {
  week_start: string;
  week_end: string;
  days: WeeklyPlanDay[];
  unscheduled: Task[];
}

export interface WeeklyPlanGenerated {
  week_start: string;
  week_end: string;
  assigned: number;
  plan: WeeklyPlan;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  completado: "Completado",
  en_proceso: "En proceso",
  por_iniciar: "Por iniciar",
  atrasado: "Atrasado",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  completado: "bg-emerald-50 text-emerald-900 border-emerald-200",
  en_proceso: "bg-amber-50 text-amber-900 border-amber-200",
  por_iniciar: "bg-stone-100 text-stone-800 border-stone-300",
  // Atrasado is the "seal" — keep it visibly louder than the other badges.
  atrasado: "bg-red-100 text-red-800 border-red-400 font-semibold",
};
