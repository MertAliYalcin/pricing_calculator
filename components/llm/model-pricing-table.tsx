import type { LlmProvider } from "@/lib/llm/models";

/** Published rates carry at most two decimals, and a fixed two keeps the column aligned. */
function formatRate(value: number): string {
  return value.toFixed(2);
}

/**
 * The published rate card, one block per provider. Rendered on the server — there is nothing
 * interactive here, so none of this reaches the browser as JavaScript.
 */
export function ModelPricingTable({ providers }: { providers: readonly LlmProvider[] }) {
  return (
    <div className="space-y-10">
      {providers.map((provider) => (
        <section key={provider.id} aria-labelledby={`provider-${provider.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/15 pb-2">
            <h2 id={`provider-${provider.id}`} className="text-xl leading-none">
              {provider.name}
            </h2>
            <p className="annot text-xs">
              retrieved {provider.retrievedOn} from{" "}
              <a
                href={provider.source}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-rule underline-offset-2 transition-colors hover:text-stamp"
              >
                {new URL(provider.source).host}
              </a>
            </p>
          </div>

          <div className="grid grid-cols-[1fr_6rem_6rem] gap-x-4">
            <div className="eyebrow border-b border-rule/60 py-2">Model</div>
            <div className="eyebrow border-b border-rule/60 py-2 text-right">Input $/1M</div>
            <div className="eyebrow border-b border-rule/60 py-2 text-right">Output $/1M</div>

            {provider.models.map((model) => (
              <div key={model.id} className="col-span-3 grid grid-cols-subgrid border-b border-rule/60 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{model.name}</div>
                  {model.note && <div className="annot text-xs">{model.note}</div>}
                </div>
                <div className="figure text-right text-sm tabular-nums">{formatRate(model.inputPricePerM)}</div>
                <div className="figure text-right text-sm tabular-nums">{formatRate(model.outputPricePerM)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
