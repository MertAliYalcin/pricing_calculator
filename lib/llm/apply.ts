import { db } from "@/lib/db";
import { roundForPersistence } from "@/lib/money";
import { syncFormulaParameterValues } from "@/lib/parameters";
import { createSnapshotFromLines, getEstimateRepriceInput, getRawParameters } from "@/lib/estimates";
import { repriceLines } from "@/lib/reprice";
import {
  LLM_SELECTION_PARAMETER_KEYS,
  selectionParameterValues,
  type LlmSelection,
} from "@/lib/llm/blend";
import { findLlmModel, type ResolvedLlmModel } from "@/lib/llm/models";

/** `Setting` keys holding the operator's model choice. The prices live in parameters. */
export const N1_MODEL_SETTING_KEY = "llm_n1_model_id";
export const N2_MODEL_SETTING_KEY = "llm_n2_model_id";

export class LlmParametersMissingError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `The model-selection parameters are missing: ${keys.join(", ")}. Re-run \`npm run db:seed\` or recreate them on /parameters.`,
    );
  }
}

/**
 * The estimate the model choice is measured against: the *earliest* saved estimate with a line
 * that references `blended_llm_cost_per_query`.
 *
 * Earliest on purpose. "Apply to Normo" saves a new snapshot each time, and if the baseline were
 * the newest, each experiment would silently be measured against the previous one. Anchoring on
 * the first means the delta always reads against the original workbook figure.
 *
 * Found by formula rather than by the name "Normo - Monthly", so renaming the estimate does not
 * break the page.
 */
export async function findBaselineLlmEstimateId(): Promise<string | null> {
  const line = await db.estimateLine.findFirst({
    where: {
      estimate: { status: "saved" },
      formula: { contains: "blended_llm_cost_per_query" },
    },
    orderBy: { estimate: { createdAt: "asc" } },
    select: { estimateId: true },
  });

  return line?.estimateId ?? null;
}

export type PersistedLlmSelection =
  | { kind: "known"; n1: ResolvedLlmModel; n2: ResolvedLlmModel; n1TrafficShare: number }
  | {
      kind: "custom";
      n1TrafficShare: number;
      reason: "no_setting" | "unknown_model_id" | "prices_edited";
      n1: ResolvedLlmModel | null;
      n2: ResolvedLlmModel | null;
    };

/**
 * What the app currently believes is selected, reconciled against reality.
 *
 * The `Setting` rows carry only a label; the parameters carry the numbers that actually price the
 * estimate. Those can disagree — someone can edit `n1_input_price_per_1m_tokens` by hand on
 * `/parameters`. When they do, the stored label is a lie, so this reports `custom` rather than
 * naming a model that no longer describes the numbers (CLAUDE.md rule 5, applied to metadata).
 */
export async function getPersistedLlmSelection(): Promise<PersistedLlmSelection> {
  const [settings, parameters] = await Promise.all([
    db.setting.findMany({ where: { key: { in: [N1_MODEL_SETTING_KEY, N2_MODEL_SETTING_KEY] } } }),
    db.parameter.findMany({ where: { key: { in: [...LLM_SELECTION_PARAMETER_KEYS] } } }),
  ]);

  const byKey = new Map(parameters.map((p) => [p.key, p.value.toNumber()]));
  const n1TrafficShare = byKey.get("n1_traffic_share") ?? 0.5;

  const settingByKey = new Map(settings.map((s) => [s.key, s.value]));
  const n1Id = settingByKey.get(N1_MODEL_SETTING_KEY);
  const n2Id = settingByKey.get(N2_MODEL_SETTING_KEY);
  if (!n1Id || !n2Id) {
    return { kind: "custom", n1TrafficShare, reason: "no_setting", n1: null, n2: null };
  }

  const n1 = findLlmModel(n1Id) ?? null;
  const n2 = findLlmModel(n2Id) ?? null;
  if (!n1 || !n2) {
    return { kind: "custom", n1TrafficShare, reason: "unknown_model_id", n1, n2 };
  }

  const matches =
    byKey.get("n1_input_price_per_1m_tokens") === roundForPersistence(n1.inputPricePerM) &&
    byKey.get("n1_output_price_per_1m_tokens") === roundForPersistence(n1.outputPricePerM) &&
    byKey.get("n2_input_price_per_1m_tokens") === roundForPersistence(n2.inputPricePerM) &&
    byKey.get("n2_output_price_per_1m_tokens") === roundForPersistence(n2.outputPricePerM);

  if (!matches) {
    return { kind: "custom", n1TrafficShare, reason: "prices_edited", n1, n2 };
  }

  return { kind: "known", n1, n2, n1TrafficShare };
}

export type ApplyLlmSelectionResult = {
  estimateId: string;
  estimateName: string;
  baselineTotal: number | null;
  total: number;
  parameterErrors: { key: string; error: string }[];
  hasErrors: boolean;
};

/**
 * Persists a model selection and snapshots the result.
 *
 * Writes, in one transaction: the five selection parameters, the two `Setting` rows recording
 * which models those prices came from, the reconciled cache of every dependent formula
 * parameter, and a **new** saved estimate.
 *
 * New, not overwritten. The baseline snapshot keeps its frozen numbers (CLAUDE.md rule 4), so
 * `/estimates` accumulates a comparable history of model decisions and the original workbook
 * figure stays available to measure against.
 */
export async function applyLlmSelection({
  n1ModelId,
  n2ModelId,
  n1TrafficShare,
  estimateId,
}: {
  n1ModelId: string;
  n2ModelId: string;
  n1TrafficShare: number;
  estimateId: string;
}): Promise<ApplyLlmSelectionResult> {
  const n1 = findLlmModel(n1ModelId);
  const n2 = findLlmModel(n2ModelId);
  if (!n1 || !n2) throw new Error(`Unknown model id: ${!n1 ? n1ModelId : n2ModelId}`);

  const source = await getEstimateRepriceInput(estimateId);
  if (!source) throw new Error(`Saved estimate "${estimateId}" was not found.`);

  const selection: LlmSelection = { n1, n2, n1TrafficShare };
  const values = selectionParameterValues(selection);

  // Checked before the transaction so a missing parameter is a clean 409 rather than a rollback.
  const existing = await db.parameter.findMany({
    where: { key: { in: [...LLM_SELECTION_PARAMETER_KEYS] } },
    select: { key: true },
  });
  const missing = LLM_SELECTION_PARAMETER_KEYS.filter((k) => !existing.some((p) => p.key === k));
  if (missing.length > 0) throw new LlmParametersMissingError(missing);

  const name = `Normo - Monthly — ${n1.name} / ${n2.name}`;
  const share = Math.round(n1TrafficShare * 100);

  return db.$transaction(async (tx) => {
    for (const key of LLM_SELECTION_PARAMETER_KEYS) {
      await tx.parameter.update({ where: { key }, data: { value: values[key] } });
    }

    for (const [key, value] of [
      [N1_MODEL_SETTING_KEY, n1ModelId],
      [N2_MODEL_SETTING_KEY, n2ModelId],
    ] as const) {
      await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    await syncFormulaParameterValues(tx);

    // Re-read the parameters *inside* the transaction so the snapshot is priced off what was just
    // written, not off the values the client happened to send.
    const parameters = await getRawParameters(tx);
    const projected = repriceLines({ lines: source.lines, parameters });

    const created = await createSnapshotFromLines(
      {
        name,
        lines: source.lines,
        parameters,
        notes: [
          `N1 ${n1.name} (${n1.provider.name}) · N2 ${n2.name} (${n2.provider.name}) · ${share}/${100 - share} split.`,
          `Applied from /llms/test against "${source.estimateName}".`,
          source.baselineTotal != null
            ? `Baseline ${source.baselineTotal.toFixed(2)} → ${projected.total.toFixed(2)}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      },
      tx,
    );

    return {
      estimateId: created.id,
      estimateName: name,
      baselineTotal: source.baselineTotal,
      total: created.total,
      parameterErrors: created.parameterErrors,
      hasErrors: created.hasErrors,
    };
  });
}
