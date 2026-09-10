import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { LlmNav } from "@/components/llm/llm-nav";

export default function LlmsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader
        eyebrow="Assumptions"
        title="LLMs"
        note="Published per-token prices, and what swapping models does to the monthly total."
      />
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
        <aside className="lg:w-52 lg:shrink-0">
          <div className="lg:sticky lg:top-8">
            <LlmNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
