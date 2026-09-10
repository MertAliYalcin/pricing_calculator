"use client";

import { useMemo, useState } from "react";
import type { RawParameter } from "@/lib/parameters/graph";
import { repriceLines, type RepriceLine } from "@/lib/reprice";
import {
  evaluateBlendedCostPerQuery,
  selectionParameterValues,
  type LlmSelection,
} from "@/lib/llm/blend";
import { findLlmModel } from "@/lib/llm/models";
import { ModelPicker } from "@/components/llm/model-picker";
import { TrafficSplitField } from "@/components/llm/traffic-split-field";
import { SandboxSummary } from "@/components/llm/sandbox-summary";
import { ProjectedLinesTable } from "@/components/llm/projected-lines-table";
import { ApplyToNormoButton } from "@/components/llm/apply-to-normo-button";

export type LlmSandboxProps = {
  estimateId: string;
  estimateName: string;
  baselineTotal: number | null;
  savedAt: string | null;
  lines: RepriceLine[];
  parameters: RawParameter[];
  initialN1ModelId: string;
  initialN2ModelId: string;
  initialN1TrafficShare: number;
  /** Set when the stored model labels no longer describe the live parameter values. */
  customSelectionNote: string | null;
};

/**
 * The what-if sheet. Everything here is computed in the browser on every change — the same
 * approach `components/catalog/item-card.tsx` uses to reprice a card as you type — so exploring
 * costs nothing and touches nothing. `ApplyToNormoButton` is the only thing that writes.
 */
export function LlmSandbox({
  estimateId,
  estimateName,
  baselineTotal,
  savedAt,
  lines,
  parameters,
  initialN1ModelId,
  initialN2ModelId,
  initialN1TrafficShare,
  customSelectionNote,
}: LlmSandboxProps) {
  const [n1Id, setN1Id] = useState(initialN1ModelId);
  const [n2Id, setN2Id] = useState(initialN2ModelId);
  const [sharePct, setSharePct] = useState(Math.round(initialN1TrafficShare * 100));

  const { blend, projected, llmLine, selection } = useMemo(() => {
    const n1 = findLlmModel(n1Id)!;
    const n2 = findLlmModel(n2Id)!;
    const selection: LlmSelection = { n1, n2, n1TrafficShare: sharePct / 100 };

    const overrides = selectionParameterValues(selection);
    const projected = repriceLines({ lines, parameters, overrides });

    // The blend priced on its own, so the per-query figure carries its own breakdown rather than
    // only appearing inside the LLM line's scope. Read off the *resolved* parameters, so
    // `input_tokens_per_query` — a formula over the ratio — is the value that actually priced it.
    const resolved = new Map(projected.parameters.map((p) => [p.key, p.value]));
    const blend = evaluateBlendedCostPerQuery(selection, {
      inputTokensPerQuery: resolved.get("input_tokens_per_query") ?? 0,
      outputTokensPerQuery: resolved.get("output_tokens_per_query") ?? 0,
    });

    const llmLineResult = projected.lines.find((l) => l.itemName.startsWith("LLM Inference"));

    return {
      blend,
      projected,
      selection,
      llmLine: llmLineResult
        ? llmLineResult.ok
          ? ({ ok: true, trace: llmLineResult.trace } as const)
          : ({ ok: false, kind: "syntax", message: llmLineResult.message } as const)
        : null,
    };
  }, [n1Id, n2Id, sharePct, lines, parameters]);

  return (
    <div className="space-y-10">
      <section>
        <p className="annot mb-6 text-sm">
          Repricing <span className="not-italic">{estimateName}</span>. Nothing is saved until you apply.
        </p>

        {customSelectionNote && <p className="annot mb-6 text-xs text-pencil">{customSelectionNote}</p>}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_8rem]">
          <ModelPicker label="N1 model" value={n1Id} onChange={setN1Id} />
          <ModelPicker label="N2 model" value={n2Id} onChange={setN2Id} />
          <TrafficSplitField sharePct={sharePct} onChange={setSharePct} />
        </div>
      </section>

      <section>
        <SandboxSummary
          blend={blend}
          llmLine={llmLine}
          projected={projected}
          baselineTotal={baselineTotal}
          savedAt={savedAt}
        />
      </section>

      <section>
        <ApplyToNormoButton
          estimateId={estimateId}
          n1ModelId={n1Id}
          n2ModelId={n2Id}
          n1TrafficShare={selection.n1TrafficShare}
          n1Name={selection.n1.name}
          n2Name={selection.n2.name}
          projectedTotal={projected.total}
          disabled={projected.hasErrors}
        />
      </section>

      <section>
        <h2 className="eyebrow mb-4">Projected lines</h2>
        <ProjectedLinesTable lines={projected.lines} />
      </section>
    </div>
  );
}
