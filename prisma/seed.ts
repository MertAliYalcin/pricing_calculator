import { PrismaClient } from "@prisma/client";
import { createSnapshotFromLines, getRawParameters } from "@/lib/estimates";
import type { RepriceLine } from "@/lib/reprice";
import { BLENDED_LLM_COST_FORMULA } from "@/lib/llm/blend";
import { DEFAULT_N1_MODEL_ID, DEFAULT_N2_MODEL_ID, findLlmModel } from "@/lib/llm/models";

const db = new PrismaClient();

// The N1/N2 defaults come from the model catalog rather than being retyped here: two independent
// copies of "GPT-5.1 is 1.25/10" would drift, and the $6,222.37 baseline would move with them.
const N1 = findLlmModel(DEFAULT_N1_MODEL_ID)!;
const N2 = findLlmModel(DEFAULT_N2_MODEL_ID)!;

/**
 * Everything below is transcribed from `Normo Cost Estimate.xlsx` — the "Assumptions"
 * sheet becomes parameters, the "Normo - Monthly" sheet becomes categories + catalog
 * items + one saved estimate. Cell references in the comments point back at the sheet
 * so a number here can always be traced to the source workbook.
 *
 * The workbook's model *names* (Assumptions!B8 "N1 Model" = GPT-5.1, B9 "N2 Model" =
 * GPT-5.2) are text and so cannot be parameters; they live in the model catalog
 * (`lib/llm/models.ts`) and, once chosen, in the `Setting` table. Their prices and the
 * B10 traffic split are parameters — the "N1/N2 model selection" group below — and
 * `/llms/test` is what writes them.
 *
 * One deliberate departure from a literal transcription: the workbook solves its token
 * shape *backwards* from a $0.25/query target (B40 divides by B20), which is fine for a
 * fixed pair of models but circular the moment the blend itself depends on which models
 * are chosen. So the shape is anchored directly (`output_tokens_per_query`) and B20 is
 * split in two: `target_blended_llm_cost_per_query` is the figure the shape was solved
 * for, and `blended_llm_cost_per_query` is what the current selection actually costs.
 * B40/B41/B42 survive as `implied_*` and `recomputed_*` — still checks, no longer load-bearing.
 */
export const PARAMETERS = [
  // ---- Assumptions!A3:B7 — Volumes ----
  { key: "total_page_count", label: "Total page count", value: 400000, unit: "pages", group: "Assumptions — Volumes", editable: true, description: "Assumptions!B3 — every page in the corpus, OCR'd or not." },
  { key: "total_ocr_page_count", label: "Total OCR page count", value: 200000, unit: "pages", group: "Assumptions — Volumes", editable: true, description: "Assumptions!B4 — the scanned subset that needs OCR." },
  { key: "expected_user_count", label: "Expected user count", value: 1000, unit: "users", group: "Assumptions — Volumes", editable: true, description: "Assumptions!B5" },
  { key: "queries_per_user_per_month", label: "Queries per user (per month)", value: 20, unit: "queries/user/month", group: "Assumptions — Volumes", editable: true, description: "Assumptions!B6" },
  { key: "monthly_incoming_queries", label: "Monthly incoming queries", value: 20000, unit: "queries/month", group: "Assumptions — Volumes", formula: "expected_user_count * queries_per_user_per_month", description: "Assumptions!B7 = B5*B6" },

  // ---- Assumptions!A14:C23 — Unit rates & conversions ----
  { key: "ocr_price_per_1k_pages", label: "OCR price per 1,000 pages", value: 2, unit: "USD/1,000 pages", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B14 — mistral-ocr-latest, batch." },
  { key: "avg_tokens_per_page", label: "Average tokens per page (all pages)", value: 1200, unit: "tokens/page", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B15" },
  { key: "embedding_price_per_1m_tokens", label: "Embedding price per 1M tokens", value: 0.135417, unit: "USD/M tokens", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B16 — text-embedding-3-large." },
  { key: "pinecone_initial_bulk_upsert_fee", label: "Pinecone initial bulk upsert fee", value: 10, unit: "USD flat", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B17 — one-time." },
  { key: "s3_data_volume_gb", label: "S3 data volume", value: 60, unit: "GB", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B18 — the uploaded corpus, also the monthly stored volume." },
  { key: "s3_price_per_gb_initial_upload", label: "S3 price per GB (initial upload)", value: 0.083333, unit: "USD/GB", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B19" },
  { key: "target_blended_llm_cost_per_query", label: "Target blended LLM cost per query", value: 0.25, unit: "USD/query", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B20 — the blend the token shape was solved for. Not the live blend: see blended_llm_cost_per_query." },
  { key: "blended_llm_cost_per_query", label: "Blended LLM cost per query", value: 0.25, unit: "USD/query", group: "Assumptions — Unit rates & conversions", formula: BLENDED_LLM_COST_FORMULA, description: "Assumptions!B20/B31/B48 — the blend implied by the current N1/N2 selection. Set from /llms/test." },
  { key: "cohere_rerank_cost_per_query", label: "Cohere Rerank cost per query", value: 0.01, unit: "USD/query", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B21" },
  { key: "pinecone_monthly_base_fee", label: "Pinecone monthly base fee", value: 50, unit: "USD/month", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B22 — flat." },
  { key: "s3_price_per_gb_month", label: "S3 price per GB (monthly storage)", value: 0.083333, unit: "USD/GB-month", group: "Assumptions — Unit rates & conversions", editable: true, description: "Assumptions!B23" },

  // ---- Token shape (Assumptions!B40:B41, promoted) ----
  // The workbook derived these from the $0.25 target; here they are the anchor the blend prices
  // against, so the blend can be a function of the chosen models without the graph going circular.
  { key: "output_tokens_per_query", label: "Output tokens per query", value: 11904.761905, unit: "tokens/query", group: "Assumptions — Token shape", editable: true, description: "Assumptions!B40's value, promoted to the anchor of the token shape. Its original derivation is kept as implied_output_tokens_per_query." },
  { key: "input_tokens_per_query", label: "Input tokens per query", value: 71428.57143, unit: "tokens/query", group: "Assumptions — Token shape", formula: "input_output_token_ratio * output_tokens_per_query", description: "Assumptions!B41 = B39*B40. A formula, so the 6:1 ratio stays load-bearing rather than decorative." },

  // ---- N1/N2 model selection — written by /llms/test ----
  { key: "n1_traffic_share", label: "N1 share of traffic", value: 0.5, unit: "share of queries", group: "Assumptions — N1/N2 model selection", editable: true, description: "Assumptions!B10 — a 50/50 N1/N2 split. N2 serves the remainder." },
  { key: "n1_input_price_per_1m_tokens", label: "N1 selected model — input price per 1M tokens", value: N1.inputPricePerM, unit: "USD/M tokens", group: "Assumptions — N1/N2 model selection", editable: true, description: `Defaults to ${N1.name} (${N1.provider.name}), the workbook's N1. Overwritten by "Apply to Normo" on /llms/test.` },
  { key: "n1_output_price_per_1m_tokens", label: "N1 selected model — output price per 1M tokens", value: N1.outputPricePerM, unit: "USD/M tokens", group: "Assumptions — N1/N2 model selection", editable: true, description: `Defaults to ${N1.name} (${N1.provider.name}), the workbook's N1. Overwritten by "Apply to Normo" on /llms/test.` },
  { key: "n2_input_price_per_1m_tokens", label: "N2 selected model — input price per 1M tokens", value: N2.inputPricePerM, unit: "USD/M tokens", group: "Assumptions — N1/N2 model selection", editable: true, description: `Defaults to ${N2.name} (${N2.provider.name}), the workbook's N2. Overwritten by "Apply to Normo" on /llms/test.` },
  { key: "n2_output_price_per_1m_tokens", label: "N2 selected model — output price per 1M tokens", value: N2.outputPricePerM, unit: "USD/M tokens", group: "Assumptions — N1/N2 model selection", editable: true, description: `Defaults to ${N2.name} (${N2.provider.name}), the workbook's N2. Overwritten by "Apply to Normo" on /llms/test.` },

  // ---- Assumptions!A27:C31 — Claude Haiku 4.5 ----
  { key: "haiku_input_price_per_1m_tokens", label: "Haiku 4.5 input price per 1M tokens", value: 1, unit: "USD/M tokens", group: "Assumptions — Claude Haiku 4.5", editable: true, description: "Assumptions!B27" },
  { key: "haiku_output_price_per_1m_tokens", label: "Haiku 4.5 output price per 1M tokens", value: 5, unit: "USD/M tokens", group: "Assumptions — Claude Haiku 4.5", editable: true, description: "Assumptions!B28" },
  { key: "blended_haiku_cost_per_query", label: "Blended Haiku cost per query", value: 0.130952, unit: "USD/query", group: "Assumptions — Claude Haiku 4.5", formula: "input_tokens_per_query / 1000000 * haiku_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * haiku_output_price_per_1m_tokens", description: "Assumptions!B31 — Haiku on both legs, priced off the live token anchors. A reference point for /llms/test, not used by any item." },

  // ---- Assumptions!A35:C42 — GPT model pricing & token assumptions ----
  { key: "gpt_51_input_price_per_1m_tokens", label: "GPT-5.1 (N1) input price per 1M tokens", value: 1.25, unit: "USD/M tokens", group: "Assumptions — GPT model pricing & tokens", editable: true, description: "Assumptions!B35" },
  { key: "gpt_51_output_price_per_1m_tokens", label: "GPT-5.1 (N1) output price per 1M tokens", value: 10, unit: "USD/M tokens", group: "Assumptions — GPT model pricing & tokens", editable: true, description: "Assumptions!B36" },
  { key: "gpt_52_input_price_per_1m_tokens", label: "GPT-5.2 (N2) input price per 1M tokens", value: 1.75, unit: "USD/M tokens", group: "Assumptions — GPT model pricing & tokens", editable: true, description: "Assumptions!B37" },
  { key: "gpt_52_output_price_per_1m_tokens", label: "GPT-5.2 (N2) output price per 1M tokens", value: 14, unit: "USD/M tokens", group: "Assumptions — GPT model pricing & tokens", editable: true, description: "Assumptions!B38" },
  { key: "input_output_token_ratio", label: "Input:output token ratio (shape)", value: 6, unit: "input tokens / output token", group: "Assumptions — GPT model pricing & tokens", editable: true, description: "Assumptions!B39" },
  { key: "implied_output_tokens_per_query", label: "Implied output tokens per query", value: 11904.761905, unit: "tokens/query", group: "Assumptions — GPT model pricing & tokens", formula: "(target_blended_llm_cost_per_query * 1000000) / (0.5 * (input_output_token_ratio * (gpt_51_input_price_per_1m_tokens + gpt_52_input_price_per_1m_tokens) + (gpt_51_output_price_per_1m_tokens + gpt_52_output_price_per_1m_tokens)))", description: "Assumptions!B40 — how the workbook derived the token shape: the output tokens that make a 50/50 GPT-5.1/5.2 blend cost exactly the target. Kept as documentation; nothing prices off it (output_tokens_per_query is the live anchor)." },
  { key: "implied_input_tokens_per_query", label: "Implied input tokens per query", value: 71428.571429, unit: "tokens/query", group: "Assumptions — GPT model pricing & tokens", formula: "input_output_token_ratio * implied_output_tokens_per_query", description: "Assumptions!B41 = B39*B40. The companion to implied_output_tokens_per_query; kept as documentation." },
  { key: "recomputed_blended_gpt_cost_per_query", label: "Check — recomputed blended GPT cost per query", value: 0.25, unit: "USD/query", group: "Assumptions — GPT model pricing & tokens", formula: "0.5 * (input_tokens_per_query / 1000000 * gpt_51_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * gpt_51_output_price_per_1m_tokens) + 0.5 * (input_tokens_per_query / 1000000 * gpt_52_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * gpt_52_output_price_per_1m_tokens)", description: "Assumptions!B42 — sanity check over the live token anchors: should equal target_blended_llm_cost_per_query ($0.25) while N1/N2 are the workbook's GPT models." },

  // ---- Assumptions!A46:C48 — Claude Sonnet 5 ----
  { key: "sonnet_5_input_price_per_1m_tokens", label: "Sonnet 5 input price per 1M tokens", value: 2, unit: "USD/M tokens", group: "Assumptions — Claude Sonnet 5", editable: true, description: "Assumptions!B46" },
  { key: "sonnet_5_output_price_per_1m_tokens", label: "Sonnet 5 output price per 1M tokens", value: 10, unit: "USD/M tokens", group: "Assumptions — Claude Sonnet 5", editable: true, description: "Assumptions!B47" },
  { key: "blended_cost_per_query_haiku_sonnet", label: "Blended cost per query — Haiku (N1) / Sonnet 5 (N2)", value: 0.196429, unit: "USD/query", group: "Assumptions — Claude Sonnet 5", formula: "0.5 * (input_tokens_per_query / 1000000 * haiku_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * haiku_output_price_per_1m_tokens) + 0.5 * (input_tokens_per_query / 1000000 * sonnet_5_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * sonnet_5_output_price_per_1m_tokens)", description: "Assumptions!B48 — the Anthropic alternative to the GPT blend, over the same token anchors. A reference point for /llms/test, not used by any item." },

  // ---- Normo - Monthly!D8:D12 — AWS line items, quoted flat per month ----
  { key: "eks_control_plane_price_per_month", label: "Amazon EKS control plane", value: 73, unit: "USD/month", group: "Normo Monthly — Cloud infrastructure", editable: true, description: "Normo - Monthly!D8 — 1 hybrid node/month, 1 EKS cluster, Europe (Frankfurt)." },
  { key: "eks_worker_nodes_price_per_month", label: "EKS worker nodes (3x c7i.xlarge)", value: 509.8, unit: "USD/month", group: "Normo Monthly — Cloud infrastructure", editable: true, description: "Normo - Monthly!D9 — Linux, On-Demand 100% util, 100GB EBS each, Turkey (Istanbul)." },
  { key: "redis_cluster_price_per_month", label: "Redis cluster (3x c7i.large)", value: 254.9, unit: "USD/month", group: "Normo Monthly — Cloud infrastructure", editable: true, description: "Normo - Monthly!D10 — Linux, On-Demand 100% util, 50GB EBS each, Turkey (Istanbul)." },
  { key: "alb_price_per_month", label: "Application Load Balancer", value: 86.51, unit: "USD/month", group: "Normo Monthly — Cloud infrastructure", editable: true, description: "Normo - Monthly!D11 — 1 ALB, Turkey (Istanbul)." },
  { key: "nat_gateway_price_per_month", label: "NAT Gateway", value: 43.16, unit: "USD/month", group: "Normo Monthly — Cloud infrastructure", editable: true, description: "Normo - Monthly!D12 — 1 regional NAT Gateway, 1 AZ, Europe (Frankfurt)." },
] as const;

export const CATEGORIES = [
  { name: "Normo Monthly — Cloud infrastructure", slug: "normo-monthly-cloud-infrastructure", icon: "cloud", sortOrder: 10 },
  { name: "Normo Monthly — AI & inference", slug: "normo-monthly-ai-inference", icon: "sparkles", sortOrder: 20 },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export type ItemSeed = {
  categorySlug: CategorySlug;
  name: string;
  description: string;
  formula: string;
  unitLabel: string;
  icon?: string;
  notes?: string;
  inputs: { key: string; label: string; defaultValue: number; unit?: string; sortOrder: number }[];
};

export const ITEMS: ItemSeed[] = [
  // ---- Normo - Monthly!A8:E12 — Cloud infrastructure ----
  {
    categorySlug: "normo-monthly-cloud-infrastructure",
    name: "Amazon EKS — Normo-EKS-Cluster",
    description: "The managed Kubernetes control plane Normo runs on. Quoted flat per month by the AWS calculator rather than derived from a unit rate.",
    formula: "eks_control_plane_price_per_month",
    unitLabel: "per month",
    icon: "kubernetes",
    notes: "Europe (Frankfurt). 1 hybrid node/month; 1 EKS cluster.",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-cloud-infrastructure",
    name: "Amazon EC2 — EKS Worker Nodes (3)",
    description: "Three on-demand worker nodes carrying the application and ingestion workloads.",
    formula: "eks_worker_nodes_price_per_month",
    unitLabel: "per month",
    notes: "Turkey (Istanbul). 3x c7i.xlarge, Linux, On-Demand 100% utilisation, 100GB EBS each.",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-cloud-infrastructure",
    name: "Amazon EC2 — Redis Cluster",
    description: "Self-managed Redis on EC2 for caching and queue state.",
    formula: "redis_cluster_price_per_month",
    unitLabel: "per month",
    icon: "redis",
    notes: "Turkey (Istanbul). 3x c7i.large, Linux, On-Demand 100% utilisation, 50GB EBS each.",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-cloud-infrastructure",
    name: "Elastic Load Balancing — ALB",
    description: "The public entry point in front of the cluster.",
    formula: "alb_price_per_month",
    unitLabel: "per month",
    notes: "Turkey (Istanbul). 1 Application Load Balancer.",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-cloud-infrastructure",
    name: "Amazon VPC — NAT Gateway",
    description: "Outbound connectivity for the private subnets.",
    formula: "nat_gateway_price_per_month",
    unitLabel: "per month",
    notes: "Europe (Frankfurt). 1 regional NAT Gateway, 1 AZ.",
    inputs: [],
  },

  // ---- Normo - Monthly!A17:D20 — AI / inference (recurring) ----
  {
    categorySlug: "normo-monthly-ai-inference",
    name: "LLM Inference (N1/N2 blend)",
    description: "Answer generation across the whole monthly query volume, priced at the blended per-query rate for the N1/N2 model mix.",
    formula: "monthly_incoming_queries * blended_llm_cost_per_query",
    unitLabel: "per query",
    notes: "The single line the model choice enters through. Which models N1 and N2 are, and how traffic splits between them, are parameters now — pick them on /llms/test to see this card and the monthly total move, then Apply to keep the result. Defaults to the workbook's GPT-5.1 / GPT-5.2 at 50/50 (Assumptions!B8:B10).",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-ai-inference",
    name: "Cohere Rerank",
    description: "Reranking of retrieved passages, once per incoming query.",
    formula: "monthly_incoming_queries * cohere_rerank_cost_per_query",
    unitLabel: "per query",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-ai-inference",
    name: "Pinecone (storage + queries)",
    description: "Vector database subscription covering both index storage and query volume at this scale.",
    formula: "pinecone_monthly_base_fee",
    unitLabel: "per month",
    notes: "Flat monthly base fee (Assumptions!B22); the one-time bulk upsert fee belongs to the Build phase, not here.",
    inputs: [],
  },
  {
    categorySlug: "normo-monthly-ai-inference",
    name: "S3 Storage",
    description: "Ongoing object storage for the source documents and derived artefacts.",
    formula: "s3_data_volume_gb * s3_price_per_gb_month",
    unitLabel: "per GB per month",
    inputs: [],
  },
];

/**
 * Builds the saved estimate for the given categories from the current catalog defaults.
 *
 * The freezing itself is `createSnapshotFromLines` in `lib/estimates.ts` — the same function
 * "Apply to Normo" uses — so the seed and the app can never disagree about what a snapshot
 * consists of. All this does is turn catalog items into lines at qty 1.
 */
async function buildNormoEstimate(name: string, categorySlugs: readonly CategorySlug[], notes?: string) {
  const items = await db.item.findMany({
    where: { category: { slug: { in: [...categorySlugs] } } },
    include: { inputs: { orderBy: { sortOrder: "asc" } }, category: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const lines: RepriceLine[] = items.map((item) => ({
    id: item.id,
    itemId: item.id,
    itemName: item.name,
    categoryName: item.category.name,
    formula: item.formula,
    quantity: 1,
    inputValues: {},
    itemInputs: item.inputs.map((inp) => ({
      key: inp.key,
      label: inp.label,
      defaultValue: inp.defaultValue.toNumber(),
      unit: inp.unit,
    })),
  }));

  const result = await createSnapshotFromLines(
    { name, lines, parameters: await getRawParameters(), notes },
    db,
  );

  if (result.hasErrors || result.parameterErrors.length > 0) {
    // A seeded estimate with an errored line means a formula or parameter in this file is wrong.
    // Better to stop here than to leave a broken snapshot in the database looking authoritative.
    throw new Error(
      `Seeded estimate "${name}" did not price cleanly. Parameter errors: ${JSON.stringify(result.parameterErrors)}`,
    );
  }
}

/**
 * Drops every row this app owns, then rebuilds the catalog from the workbook.
 * Deliberately a full wipe, not a reconciliation: the previous catalog (an older
 * AWS/OpenAI recalculation plus a Build-phase catalog) is being replaced outright
 * by the workbook's Assumptions + Normo - Monthly sheets.
 */
async function wipe() {
  await db.estimateLine.deleteMany({});
  await db.estimate.deleteMany({});
  await db.formulaRevision.deleteMany({});
  await db.itemInput.deleteMany({});
  await db.item.deleteMany({});
  await db.category.deleteMany({});
  await db.parameter.deleteMany({});
  // Including the settings: the stored LLM model selection labels the parameter values, so
  // leaving them behind would have the app claiming a model that the re-seeded prices contradict.
  await db.setting.deleteMany({});
}

async function main() {
  await wipe();

  for (const p of PARAMETERS) {
    await db.parameter.create({
      data: {
        key: p.key,
        label: p.label,
        value: p.value,
        unit: p.unit,
        group: p.group,
        formula: "formula" in p ? p.formula : null,
        editable: "editable" in p ? p.editable : false,
        description: "description" in p ? p.description : null,
      },
    });
  }

  for (const c of CATEGORIES) {
    await db.category.create({ data: c });
  }

  for (const item of ITEMS) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: item.categorySlug } });
    const saved = await db.item.create({
      data: {
        categoryId: category.id,
        name: item.name,
        description: item.description,
        formula: item.formula,
        icon: item.icon ?? null,
        unitLabel: item.unitLabel,
        notes: item.notes ?? null,
      },
    });

    for (const input of item.inputs) {
      await db.itemInput.create({ data: { itemId: saved.id, ...input } });
    }
  }

  await buildNormoEstimate(
    "Normo - Monthly",
    ["normo-monthly-cloud-infrastructure", "normo-monthly-ai-inference"],
    "Recurring monthly cost at 1,000 users x 20 questions/month (20,000 queries). Transcribed from 'Normo Cost Estimate.xlsx', sheet 'Normo - Monthly'.",
  );

  await db.estimate.create({ data: { name: "Draft estimate", status: "draft" } });

  console.log(`Seeded ${PARAMETERS.length} parameters, ${CATEGORIES.length} categories, ${ITEMS.length} items.`);
}

// Guarded so this module can be imported (e.g. by tooling that reads the PARAMETERS/ITEMS
// arrays) without running the seed against the database as a side effect.
if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
