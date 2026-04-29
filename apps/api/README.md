# Backend (`apps/api`)

FastAPI backend for SDP-versity.

## Local setup

```bash
cd apps/api
uv sync
```

## Run API

```bash
bun run dev
```

## Database migrations (default Python/Alembic commands)

Generate a new migration:

```bash
cd apps/api
source .venv/bin/activate
python -m alembic -c alembic.ini revision --autogenerate -m "your_migration_message"
```

Apply migrations:

```bash
cd apps/api
source .venv/bin/activate
python -m alembic -c alembic.ini upgrade head
```

Rollback one migration:

```bash
cd apps/api
source .venv/bin/activate
python -m alembic -c alembic.ini downgrade -1
```

## Seed local data

```bash
cd apps/api
source .venv/bin/activate
python -m app.seed
```

You can also use Bun scripts:

```bash
bun run db:migrate
bun run db:seed
```
