# SyncProof

SyncProof compares invoice CSV exports from two business systems and flags records for human review.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/syncproof run dev` — run the SyncProof web app
- `pnpm --filter @workspace/syncproof run typecheck` — typecheck the SyncProof app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/syncproof/` — SyncProof web app; CSV parsing, invoice comparison, and report export are browser-side.
- `artifacts/api-server/` and `lib/db/` — shared workspace scaffolding; SyncProof does not use them.

## Architecture decisions

- Uploaded invoice data stays in the browser; do not send files or record contents to an API or external service.
- Invoice matching uses only trimmed, case-insensitive invoice numbers. Duplicate keys and incomplete rows remain flagged for human review.
- SyncProof does not connect to accounting systems, request credentials, or modify financial records.

## Product

Upload two invoice CSV exports, compare invoice numbers and amounts, inspect matching and flagged records, and download a CSV review report. Fictional sample files are included.

## User preferences

No financial discrepancy should be presented as proof of an error or loss; flagged records require human review.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
