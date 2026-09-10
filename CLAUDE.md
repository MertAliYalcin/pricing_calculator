# CLAUDE.md

Instructions for working in this repository. Read `SPEC.md` for what the product does and why; this file covers how to build it.

## Project

`pricing-calculator` — an internal, single-user web app for estimating project costs. Users browse cost items by category (storage, computation, network, licences, labour…), add them to a cart, and get a total. Every item's price comes from an editable formula built out of named parameters. Estimates can be saved and compared against a target budget.

Not a real store: no checkout, no payments, no inventory, no customers.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15, App Router, TypeScript strict |
| UI | React 19 server components by default, `"use client"` only where interactivity needs it |
| Styling | Tailwind CSS + shadcn/ui |
| Data layer | Prisma ORM against PostgreSQL 16 |
| Formula engine | `expr-eval` (restricted parser, no `eval`) |
| Validation | Zod at every trust boundary (route handlers, server actions, formula input) |
| Tests | Vitest for unit (formula engine especially), Playwright for a thin happy-path e2e |
| Money | `numeric(18,6)` in Postgres, `Decimal` in Prisma, plain `number` only inside the evaluator |

No auth, no multi-tenancy, no user table. The app assumes one trusted operator on `localhost`. Do not add login screens, session handling, or row-level ownership unless `SPEC.md` changes first.

## Database

Postgres runs in Podman. Container is expected to already exist; if it does not:

```bash
podman volume create pricing-db-data
podman run -d --name pricing-db \
  -e POSTGRES_USER=pricing \
  -e POSTGRES_PASSWORD=pricing \
  -e POSTGRES_DB=pricing \
  -p 5432:5432 \
  -v pricing-db-data:/var/lib/postgresql/data \
  docker.io/library/postgres:16
```

`.env.local`:

```
DATABASE_URL="postgresql://pricing:pricing@localhost:5432/pricing?schema=public"
```

Commands:

```bash
podman start pricing-db          # after a reboot
podman logs -f pricing-db
podman exec -it pricing-db psql -U pricing -d pricing
```

Schema changes go through Prisma migrations only — never `db push` on a database that has estimates in it, and never hand-edit a generated migration after it has been applied.

```bash
npx prisma migrate dev --name <short_snake_case_name>
npx prisma generate
npm run db:seed        # idempotent: safe to re-run
```

## Commands

```bash
npm run dev            # next dev --turbopack
npm run build          # must pass before any change is considered done
npm run lint
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run test:e2e       # playwright
npm run db:studio      # prisma studio
```

Before handing work back: `npm run typecheck && npm run lint && npm test && npm run build`. If any of those fail, the task is not finished.

## Layout

```
app/
  (catalog)/page.tsx            # category browse + item grid
  cart/page.tsx                 # current estimate, totals, budget comparison
  parameters/page.tsx           # parameter CRUD
  estimates/page.tsx            # saved estimates list
  estimates/[id]/page.tsx       # read-only snapshot view
  api/…                         # route handlers, thin
components/
  catalog/                      # ItemCard, CategoryNav, PriceTag
  formula/                      # FormulaBreakdown, FormulaEditor
  cart/
lib/
  formula/
    parse.ts                    # tokenise, extract identifiers
    evaluate.ts                 # resolve scope + compute + trace
    scope.ts                    # resolution order, collision detection
    functions.ts                # allowlisted functions
  db.ts                         # Prisma singleton
  money.ts                      # rounding, formatting
prisma/
  schema.prisma
  migrations/
  seed.ts
```

Business logic lives in `lib/`, not in components and not in route handlers. Route handlers parse input, call `lib/`, shape the response. If a component contains arithmetic on prices, it is in the wrong place.

## The formula engine is the load-bearing part

Read `SPEC.md § Formula semantics` before touching anything under `lib/formula/`. Rules that are easy to get wrong:

1. **Identifiers are flat.** `storage_gb * price_per_gb * months`, not `params.price_per_gb`. Resolution order is line input → item input default → global parameter. Shadowing is a validation error at save time, not a silent override.
2. **No `eval`, no `new Function`, ever.** Formulas are user data. `expr-eval` with a fixed function allowlist is the only path.
3. **Evaluation returns a trace, not just a number.** Every price the UI shows must be able to explain itself: the expression, each resolved identifier with its value and where it came from, and the final result. The trace is not a debug afterthought — it is the product feature behind clicking a price tag.
4. **Saved estimates are snapshots.** When an estimate is saved, the formula text, the resolved values, and the computed totals are copied into the estimate rows. Editing a parameter afterwards must never change a saved estimate's numbers. If you find yourself joining a saved estimate back to the live `parameters` table to display a total, that is a bug.
5. **Fail visibly.** A formula with an unknown identifier, a divide-by-zero, or a cycle renders as an error state on that item and excludes it from the total with a warning — it does not render as `0`, `NaN`, or crash the page.

Add a unit test for every formula-engine change. The suite is the spec's teeth.

## Conventions

- Server components fetch through Prisma directly; client components go through route handlers. Do not fetch from a server component via `fetch("/api/…")`.
- Mutations use server actions where the form is colocated, route handlers where the caller is a client component doing optimistic updates (cart, formula editor).
- Zod schemas live next to the thing they validate and are exported as `<Thing>Schema`; infer types from them rather than declaring interfaces twice.
- `snake_case` for database columns and for parameter/input keys (they are user-facing identifiers inside formulas). `camelCase` everywhere in TypeScript.
- Soft-delete parameters and items (`archived_at`) — hard deletes break historical traces.
- Keep components under ~150 lines; extract before that.
- No new dependency without a one-line justification in the PR description. The dependency list above is deliberately short.

## Things not to do

- Do not add authentication, roles, or sharing.
- Do not add multi-currency or FX conversion.
- Do not introduce a second state manager. Cart state is server-side (a draft estimate row); React state is for UI only.
- Do not scaffold a Docker Compose file — the database is managed by Podman by hand.
- Do not "improve" the seed data into something demo-flashy; it exists to make the formula paths testable.
