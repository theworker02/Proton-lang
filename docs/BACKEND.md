# Proton Backend API

## Overview

Proton now includes a lightweight HTTP backend that exposes the compiler, analyzer, inspector, and runtime execution pipeline over JSON.

Start it with:

```bash
npm run backend
```

By default the server listens on `127.0.0.1:8787`.

Environment variables:

- `PROTON_BACKEND_HOST`
- `PROTON_BACKEND_PORT`

## Endpoints

### `GET /`

Returns a small service descriptor and the available routes.

### `GET /health`

Returns a simple health payload:

```json
{
  "ok": true,
  "service": "proton-backend",
  "status": "healthy"
}
```

### `GET /api/examples`

Lists bundled example programs from `examples/`.

### `POST /api/check`

Compiles and typechecks a program.

Request body:

```json
{
  "filePath": "examples/phase5.ptn"
}
```

Or inline source:

```json
{
  "sourcePath": "demo.ptn",
  "source": "module demo.main; fn main() -> int :: strict { return 0; }"
}
```

### `POST /api/build`

Returns generated JavaScript, summary data, and compile-time constants.

### `POST /api/inspect`

Returns the same structured summary used by `protonc inspect`.

### `POST /api/analyze`

Runs the analyzer and returns the report plus the inspected summary.

### `POST /api/run`

Compiles and executes the program, then returns:

- `exitCode`
- captured `logs`
- captured `warnings`
- `goals`
- `timeline`
- `graph`
- `channels`

## Path Rules

When `filePath` is used, the backend restricts file access to the Proton workspace root. Requests that try to escape the repo directory are rejected.

## Example Workflow

```bash
curl http://127.0.0.1:8787/health

curl -X POST http://127.0.0.1:8787/api/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"filePath\":\"examples/phase5.ptn\"}"
```

## Current Boundaries

- this is a local backend service, not a hosted multi-tenant platform
- execution still uses the JavaScript backend
- runtime output is structured for tooling, but long-running scheduling is not yet implemented
- plugin behavior remains intentionally limited to the current curated runtime surface
