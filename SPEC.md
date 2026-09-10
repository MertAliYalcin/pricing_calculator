# SPEC.md — Pricing Calculator

## 1. Purpose

Estimate the cost of a prospective project quickly and transparently, so the operator has the numbers in front of them when deciding whether to take the work on. The app produces costs and comparisons; the judgement stays with the person reading them.

The workflow it replaces is a spreadsheet where the formulas are invisible, the rates are copied between tabs and drift apart, and nobody can tell why last quarter's estimate said what it said.

The app therefore optimises for three things: assembling an estimate fast (shop for cost items), seeing exactly how any number was produced (click the price, read the formula), and keeping old estimates truthful (snapshots, not live joins).

## 2. Users and scope

Single operator, running locally, fully trusted. No accounts, no permissions, no audit trail beyond timestamps. One currency.

Out of scope for v1: payments, quoting/PDF export, approval workflows, multi-currency, automated ingestion of cloud-provider or model price lists, sharing estimates with clients.

In scope, as a deliberate exception to that last item: a hand-maintained reference table of *published* LLM per-token prices (§4.6). It is transcribed by hand, carries the source URL and retrieval date for every provider, and is never fetched at runtime — it is a citation, not an integration.

## 3. Domain model

### 3.1 Parameter

A named number used across formulas. Global.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `key` | text, unique | formula identifier, `snake_case`, `^[a-z][a-z0-9_]*$` |
| `label` | text | human name, e.g. "Storage price per GB-month" |
| `value` | numeric(18,6) | |
| `unit` | text, nullable | display only, e.g. `USD/GB/month`, `hours` |
| `group` | text, nullable | for grouping in the UI, e.g. `Infrastructure`, `Labour` |
| `description` | text, nullable | |
| `archived_at` | timestamptz, nullable | |

Parameter keys are reserved globally: an item input may not reuse one (see § 5.3).

### 3.2 Category

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `name` | text | e.g. Storage, Computation, Network, Licences, Labour |
| `slug` | text, unique | |
| `icon` | text, nullable | lucide icon name |
| `sort_order` | int | |

Flat, no nesting. Adding a category is a normal user action, not a migration.

### 3.3 Item

A purchasable cost line — "Object storage (standard tier)", "GPU node, A100", "Senior engineer".

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `category_id` | uuid | |
| `name` | text | |
| `description` | text, nullable | |
| `formula` | text | expression, see § 5 |
| `unit_label` | text, nullable | what one unit means, e.g. "per node" |
| `notes` | text, nullable | free-text assumptions |
| `archived_at` | timestamptz, nullable | |

### 3.4 ItemInput

Per-item variables the operator fills in when adding the item to an estimate. This is what makes items reusable: the item knows *how* storage is priced, the estimate says *how much* storage.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `item_id` | uuid | |
| `key` | text | formula identifier, unique per item |
| `label` | text | |
| `default_value` | numeric(18,6) | |
| `unit` | text, nullable | |
| `sort_order` | int | |

### 3.5 Estimate

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `name` | text | e.g. "Acme data platform — Q3" |
| `client` | text, nullable | |
| `status` | enum | `draft` \| `saved` |
| `target_budget` | numeric(18,6), nullable | what we expect to be able to charge |
| `notes` | text, nullable | |
| `total` | numeric(18,6), nullable | frozen on save |
| `created_at`, `updated_at`, `saved_at` | timestamptz | |

Exactly one `draft` estimate exists at a time and it is the cart. Saving it freezes it and creates a fresh draft.

### 3.6 EstimateLine

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `estimate_id` | uuid | |
| `item_id` | uuid, nullable | reference for navigation; may be archived later |
| `item_name` | text | snapshot |
| `category_name` | text | snapshot |
| `formula` | text | snapshot of the expression as evaluated |
| `quantity` | numeric(18,6) | default 1 |
| `input_values` | jsonb | `{ key: value }` as entered |
| `resolved_scope` | jsonb | every identifier → `{ value, source }`, frozen on save |
| `line_total` | numeric(18,6) | frozen on save |
| `error` | text, nullable | if the formula could not be evaluated |
| `sort_order` | int | |

While the estimate is a `draft`, `resolved_scope` and `line_total` are recomputed on every read. On save they stop being derived and become the record.

### 3.7 FormulaRevision

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `item_id` | uuid | |
| `formula` | text | previous expression |
| `replaced_at` | timestamptz | |

Written on every item formula change. Enables "revert" and answers "who changed the storage maths".

### 3.8 Setting

| Field | Type | Notes |
| --- | --- | --- |
| `key` | text, pk | |
| `value` | text | |
| `updated_at` | timestamptz | |

App-level singleton settings — a label or a choice that is not a number and so cannot live on a `Parameter` (whose `value` is `numeric`). Currently only `llm_n1_model_id` / `llm_n2_model_id`, recording *which* catalog model the operator selected in §4.6; the prices themselves are parameters, and the parameters are the truth. Anything needing more than one row per concept gets its own table rather than being stuffed in here.

## 4. Pages

### 4.1 Catalog — `/`

The shopping surface. Left rail lists categories with item counts; main area is a grid of item cards.

Each card shows name, description, unit label, and a **price tag** — the item's cost computed with input defaults and `qty = 1`. The tag is a button (§ 4.5). Cards have a quantity stepper, inline fields for any item inputs (prefilled with defaults), and *Add to estimate*.

Search filters across item name, description and notes. A category header has *+ New item*, which opens the item editor (name, description, inputs, formula) with a live-preview price.

### 4.2 Parameters — `/parameters`

A dense editable table grouped by `group`: key, label, value, unit, and a "used by" count linking to the items whose formulas reference that key.

- Values are edited inline; a save is immediate and recomputes the draft estimate.
- Changing a value shows a toast reporting the delta to the current draft total: *"Draft estimate: $41,200 → $44,750 (+8.6%)"*. This is the point of the page — the operator is tuning assumptions and wants to see the consequence.
- Renaming a `key` rewrites the identifier in every formula that references it, inside one transaction, and reports how many items were touched. Deleting a key that is in use is blocked; the dialog lists the blocking items.
- Archiving hides a parameter from pickers but keeps it resolvable for historical traces.

### 4.3 Estimate / cart — `/cart`

Lines grouped by category, each showing item name, quantity, inputs (editable in place), and line total with its own price tag. Group subtotals, then a summary panel: total, optional `target_budget` input, and — when a target is set — the difference between the two in absolute terms and as a percentage of the target.

The app does not label an estimate feasible, tight, over budget, or anything equivalent, and does not colour-code the total against the target. No thresholds, no traffic lights, no recommendation. It presents cost, target, and difference as plain figures and stops there; whether the project is worth doing depends on strategy, relationship, and risk appetite that the app has no visibility into. The one thing the summary panel *does* flag is arithmetic it could not perform (below).

Lines that failed to evaluate render an error state, are excluded from the total, and put a warning in the summary panel so a broken formula can never silently deflate a total.

Actions: *Save estimate* (name + client, freezes, starts a new draft), *Clear*, *Duplicate from saved*.

### 4.4 Estimates — `/estimates`, `/estimates/[id]`

List: name, client, saved date, total, target, and difference. Sort and filter by client or date.

Detail: read-only. Price tags still open the breakdown, rendered from `resolved_scope` — that is, showing the parameter values *as they were when saved*, with a note if a referenced parameter has since changed. *Duplicate into draft* copies the lines into a new draft, re-resolved against today's parameters, so the operator can see what the same project would cost now.

### 4.5 Formula breakdown (the price-tag popover)

Opens from any price tag anywhere in the app. Contents:

1. The expression, syntax-highlighted, identifiers as chips.
2. A substitution table — one row per identifier: key, label, resolved value, unit, and source (`line input` / `item default` / `parameter`). Parameter rows link to `/parameters`.
3. The expression with values substituted, then the result. Quantity is applied as a separate visible step: `unit price × qty = line total`.
4. *Edit formula* → inline editor with:
   - live validation as you type: unknown identifiers, syntax errors, and disallowed functions are flagged with the offending token position;
   - an identifier picker listing available parameters and this item's inputs;
   - a live preview of the resulting price and the delta against the current one;
   - saving writes a `FormulaRevision` and recomputes the draft. On a saved estimate, editing is disabled — snapshots are immutable.

### 4.6 LLMs — `/llms`

A left rail with two sub-tabs. Exists because model choice is the single largest lever on an AI project's recurring cost, and it was previously buried in one hand-edited constant.

**Model pricing list — `/llms/models`.** Published input and output price per 1M tokens, grouped by provider. Every provider block names its source URL and the date the prices were read off it. Read-only: prices change by editing the module, so the table can always be audited against the linked page.

**Test LLM pricing — `/llms/test`.** Pick an N1 model, an N2 model and the traffic split; every line of the baseline monthly estimate reprices in the browser as you choose. Shows the blended cost per query, the affected line, the projected total, the baseline total, and the delta — each with its own price-tag breakdown, so a projected number explains itself exactly like a real one (§4.5).

Nothing is written while exploring. *Apply to Normo* persists the selection: it updates the five selection parameters and saves the result as a **new** estimate named after the chosen models. The baseline snapshot is never overwritten, so deltas always read against the original and each experiment is kept and comparable in `/estimates`.

## 5. Formula semantics

### 5.1 Syntax

Arithmetic expressions over flat identifiers. `+ - * / % ^`, parentheses, comparison and ternary. Numeric literals only.

```
storage_gb * price_per_gb * months
ceil(peak_rps / rps_per_node) * node_hourly * hours_per_month * months
dev_days * senior_day_rate * (1 + overhead_rate) * (1 + risk_buffer)
data_egress_gb > free_egress_gb ? (data_egress_gb - free_egress_gb) * egress_per_gb : 0
```

Allowlisted functions only: `min`, `max`, `abs`, `round`, `ceil`, `floor`, `sqrt`, `pow`, `log`. Anything else is a validation error. No variable assignment, no user-defined functions, no references to other items — an item's price depends only on parameters, its own inputs, and `qty`.

### 5.2 Reserved identifier

`qty` resolves to the line quantity (1 in catalog previews). It may not be used as a parameter or input key.

### 5.3 Scope resolution

An identifier resolves in this order:

1. line input value (what the operator typed for this line)
2. item input default
3. global parameter value

Ambiguity is prevented rather than resolved: creating an item input whose key matches an existing parameter key is rejected at save time, and so is creating a parameter whose key matches any item input key. The error message names the conflict. An unresolvable identifier is a hard error, never a zero.

### 5.4 Result of evaluation

```ts
type Trace = {
  expression: string;
  scope: Record<string, { value: number; label: string; unit?: string;
                          source: "line_input" | "item_default" | "parameter" }>;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type EvalResult =
  | { ok: true; trace: Trace }
  | { ok: false; kind: "syntax" | "unknown_identifier" | "disallowed_function"
                     | "division_by_zero" | "non_finite"; message: string;
      token?: string; position?: number };
```

Every price rendered in the UI comes from a `Trace`. There is no code path that computes a price without producing one.

### 5.5 Numbers and rounding

Compute in full float precision; round only for display (2 decimals, thousands separators) and when persisting a frozen total (6 decimals). Never round intermediate steps — a rounded `ceil()` input changes node counts. `Infinity` and `NaN` are errors, not values.

## 6. API

Route handlers under `/api`, all local, all JSON, all Zod-validated.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/parameters` | list, create |
| PATCH/DELETE | `/api/parameters/:id` | update value/label, rename key (cascading), archive |
| GET/POST | `/api/categories` | |
| GET/POST | `/api/items` | list (filter by category, search), create |
| PATCH/DELETE | `/api/items/:id` | includes formula change → revision |
| GET | `/api/items/:id/revisions` | |
| POST | `/api/formula/validate` | `{ expression, itemId? }` → parse + identifier check, no persistence |
| POST | `/api/formula/preview` | `{ expression, itemId?, inputs, quantity }` → `EvalResult` |
| GET | `/api/estimate/draft` | current cart with live traces |
| POST | `/api/estimate/draft/lines` | add line |
| PATCH/DELETE | `/api/estimate/draft/lines/:id` | quantity, inputs, remove |
| POST | `/api/estimate/draft/save` | freeze → `saved`, new draft |
| GET | `/api/estimates` | |
| GET | `/api/estimates/:id` | snapshot |
| POST | `/api/estimates/:id/duplicate` | into draft, re-resolved |
| POST | `/api/llm/apply` | `{ n1ModelId, n2ModelId, n1TrafficShare, estimateId }` → persist the model selection, then snapshot the repriced estimate under a new name (§4.6) |

## 7. Seed data

Enough to exercise every formula path, not a showcase. Five categories; two to four items each; roughly fifteen parameters. Must include at least one item per formula shape: plain multiplication, `ceil()` over a rate, a ternary with a free tier, and a nested percentage uplift. One deliberately broken formula is included in the test fixtures (not the seed) to cover the error path.

## 8. Acceptance criteria

1. An item can be created with a formula referencing both parameters and its own inputs, and its price tag shows a correct number immediately.
2. Clicking any price tag — catalog, cart, or saved estimate — shows the expression, every identifier with its value and source, and the arithmetic to the line total.
3. Editing a formula from the breakdown updates the catalog and draft prices without a page reload, and the previous expression is retrievable.
4. Changing a parameter value updates every dependent price and reports the delta to the draft total.
5. Renaming a parameter key updates all referencing formulas atomically; deleting one that is in use is refused with the blockers named.
6. Creating an item input that collides with a parameter key is refused with a message naming the collision.
7. A saved estimate's total does not change after parameters are edited, and its breakdown shows the values as of save time.
8. A formula with an unknown identifier shows an error on that line, excludes it from the total, and surfaces a warning in the summary — no `NaN`, no crash.
9. Setting a target budget shows the correct difference in absolute and percentage terms, including when the total exceeds the target; with no target set, the summary shows the total alone and no comparison. No feasibility label or judgement appears anywhere in the UI.
10. Duplicating a saved estimate into the draft re-resolves against current parameters and may produce a different total.
