import type { Metadata } from "next";
import Link from "next/link";
import { getEstimateRepriceInput } from "@/lib/estimates";
import {
  findBaselineLlmEstimateId,
  getPersistedLlmSelection,
  type PersistedLlmSelection,
} from "@/lib/llm/apply";
import { DEFAULT_N1_MODEL_ID, DEFAULT_N2_MODEL_ID } from "@/lib/llm/models";
import { LlmSandbox } from "@/components/llm/llm-sandbox";

export const metadata: Metadata = { title: "Test LLM pricing" };

/**
 * Why the pickers might not name a model. The stored labels are metadata; the parameters are what
 * price the estimate, so when the two disagree the page says so rather than naming a model that no
 * longer describes the numbers.
 */
function customSelectionNote(selection: PersistedLlmSelection): string | null {
  if (selection.kind === "known") return null;

  switch (selection.reason) {
    case "no_setting":
      return null; // Nothing has been applied yet — the workbook defaults below are the honest answer.
    case "unknown_model_id":
      return "The previously applied model is no longer in the pricing list, so the pickers have fallen back to the workbook defaults. The parameter values are unchanged until you apply.";
    case "prices_edited":
      return `The N1/N2 prices have been edited by hand on /parameters since ${selection.n1?.name} / ${selection.n2?.name} was applied, so the current numbers are custom. Picking a model below will overwrite them.`;
  }
}

export default async function LlmTestPage({
  searchParams,
}: {
  searchParams: Promise<{ estimate?: string }>;
}) {
  const { estimate } = await searchParams;
  const estimateId = estimate ?? (await findBaselineLlmEstimateId());

  const source = estimateId ? await getEstimateRepriceInput(estimateId) : null;

  if (!source) {
    return (
      <div className="border border-dashed border-rule px-6 py-10 text-center">
        <p className="text-sm">No saved estimate prices LLM inference yet.</p>
        <p className="annot mt-2 text-sm">
          This sheet reprices an existing estimate, so it needs one whose formula references{" "}
          <code className="figure text-xs">blended_llm_cost_per_query</code>. Run{" "}
          <code className="figure text-xs">npm run db:seed</code>, or build one from the{" "}
          <Link href="/" className="underline decoration-rule underline-offset-2 hover:text-stamp">
            catalog
          </Link>
          .
        </p>
      </div>
    );
  }

  const selection = await getPersistedLlmSelection();

  return (
    <LlmSandbox
      estimateId={source.estimateId}
      estimateName={source.estimateName}
      baselineTotal={source.baselineTotal}
      savedAt={source.savedAt?.toISOString() ?? null}
      lines={source.lines}
      parameters={source.parameters}
      initialN1ModelId={selection.n1?.id ?? DEFAULT_N1_MODEL_ID}
      initialN2ModelId={selection.n2?.id ?? DEFAULT_N2_MODEL_ID}
      initialN1TrafficShare={selection.n1TrafficShare}
      customSelectionNote={customSelectionNote(selection)}
    />
  );
}
