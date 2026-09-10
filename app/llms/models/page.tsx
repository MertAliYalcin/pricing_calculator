import type { Metadata } from "next";
import { LLM_PROVIDERS } from "@/lib/llm/models";
import { ModelPricingTable } from "@/components/llm/model-pricing-table";

export const metadata: Metadata = { title: "Model pricing list" };

export default function LlmModelsPage() {
  return (
    <>
      <p className="annot mb-8 text-sm">
        Standard, non-batch, non-cached rates as published by each provider. Prices are transcribed by
        hand and never fetched at runtime, so every figure can be checked against the linked page.
      </p>
      <ModelPricingTable providers={LLM_PROVIDERS} />
    </>
  );
}
