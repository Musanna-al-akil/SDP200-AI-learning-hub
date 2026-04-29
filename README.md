# SDP-versity

AI-enhanced classroom platform monorepo built with Bun workspaces + Turborepo.

## Tech Stack

- Frontend: Next.js (`apps/web`)
- Backend: FastAPI (`apps/api`)
- Tooling: Bun, Turborepo, TypeScript

## Apps

- Web: `http://localhost:3000`
- API: `http://localhost:8000`
- Health check: `GET /health`

## Quick Start

```bash
bun install
bun run dev
```

Run a single app:

```bash
cd apps/web && bun run dev
cd apps/api && bun run dev
```

## Common Commands (repo root)

```bash
bun run lint
bun run check-types
bun run build
bun run format
```
