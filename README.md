# Cronograma Concursos

CRUD system for managing university contest campaigns at Universidad
Iberoamericana (Mexico City). It replaces a fragile Excel-based workflow with
a FastAPI backend, a Next.js frontend, and a shared traffic-light model for
tracking task progress.

- **Backend**: FastAPI + SQLAlchemy + Pydantic v2 (SQLite for local dev,
  MySQL on Railway via PyMySQL).
- **Frontend**: Next.js 16 App Router + TypeScript + TailwindCSS + TanStack
  Query + Axios.
- **Language**: UI in Spanish (es-MX); code, commits, and API schemas in
  English.

## Architecture overview

```
cronograma-concursos/
  backend/     FastAPI service — /projects, /tasks, /goals, /health
  frontend/    Next.js app — Dashboard, Proyectos, Punto de Partida
```

### Main endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Railway health check |
| GET | `/projects/` | List projects with their tasks |
| GET | `/projects/summary` | Aggregated counters used by the dashboard |
| POST | `/projects/import-excel` | Bulk-import the legacy semaphore `.xlsx` |
| GET | `/tasks/priority?limit=&project_id=` | Priority queue ordered by severity then due date |
| POST | `/tasks/recalculate-status` | Recompute and persist status for every auto task |
| GET/POST/DELETE | `/goals` | Future goals / Punto de Partida |

### Semaphore logic

Every task exposes an `effective_status` field. By default
(`auto_status=true`) it is derived from the dates:

1. `complete == true` → `completado`
2. `end_date < today` → `atrasado`
3. `start_date <= today <= end_date` → `en_proceso`
4. `start_date > today` → `por_iniciar`
5. No dates → `por_iniciar`

Toggling `auto_status` to `false` on a task lets an operator override the
status manually via `status`. The stored value is returned as-is in
`effective_status` until they switch auto mode back on.

## Local setup (Windows / PowerShell)

Prerequisites: Python 3.12, Node.js 20+, Git.

### Backend

```powershell
cd cronograma-concursos\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

API runs on http://localhost:8000; Swagger docs on /docs.

### Frontend

```powershell
cd cronograma-concursos\frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

UI runs on http://localhost:3000.

### Running Alembic

Create a new revision after editing `app/models.py`:

```powershell
cd cronograma-concursos\backend
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Railway deployment

The project is designed to run as two Railway services (backend + frontend)
sharing a single Railway MySQL plugin.

### 1. Create a Railway project

Sign in at https://railway.app and create a new project from this
repository.

_Screenshot placeholder: Railway new project dialogue._

### 2. Add the MySQL plugin

From the project dashboard, click **New → Database → MySQL**. The plugin
exposes a `MYSQL_URL` variable (along with `MYSQLHOST`, `MYSQLUSER`,
`MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT`). The backend reads
`DATABASE_URL`, so either:

- set `DATABASE_URL` on the backend service to `${{MySQL.MYSQL_URL}}`
  (Railway reference variable), or
- paste the connection string directly as `DATABASE_URL`.

The app rewrites `mysql://` to `mysql+pymysql://` automatically so
SQLAlchemy picks the right driver.

_Screenshot placeholder: Railway MySQL plugin, Variables tab._

### 3. Deploy the backend service

Click **New → GitHub Repo** and point it at this repository. In the service
settings set:

- **Root directory**: `cronograma-concursos/backend`
- **Build / Start commands**: inherited from `railway.json` — Nixpacks runs
  `pip install -r requirements.txt`, then
  `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Health check path**: `/health` (already set in `railway.json`).

Required variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` (Railway reference) |
| `FRONTEND_ORIGIN` | e.g. `https://cronograma-frontend.up.railway.app` |
| `ENVIRONMENT` | `production` |
| `EXTRA_CORS_ORIGINS` | optional, comma-separated |

_Screenshot placeholder: Railway backend service variables._

The first deploy runs `alembic upgrade head` automatically via the start
command. If you prefer to run it manually once, use the Railway shell:

```bash
alembic upgrade head
```

### 4. Deploy the frontend service

Add a second service pointing at the same repository, with:

- **Root directory**: `cronograma-concursos/frontend`
- **Build / Start commands**: inherited from `railway.json` — Nixpacks runs
  `npm ci && npm run build`, then
  `npm run start -- -p $PORT -H 0.0.0.0`.

Required variables:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | the backend service's public URL (e.g. `https://cronograma-backend.up.railway.app`) |

Because `NEXT_PUBLIC_*` values are inlined at build time, redeploy the
frontend whenever the backend URL changes.

_Screenshot placeholder: Railway frontend service variables._

### 5. Verify

- Backend: `GET https://<backend>.up.railway.app/health` should return
  `{"status":"ok"}`.
- Frontend: open the service URL and confirm the dashboard renders. Create a
  project, add a task, then click **Recalcular semáforo** to exercise the
  full loop.

## Conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, `docs:`).
- Code, comments, and API schemas are English; user-facing UI strings remain
  in Spanish.
