"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LLM_MODEL_COUNT, LLM_PROVIDERS } from "@/lib/llm/models";

const LINKS = [
  { href: "/llms/models", label: "Model pricing list", count: `${LLM_MODEL_COUNT}` },
  { href: "/llms/test", label: "Test LLM pricing", count: `${LLM_PROVIDERS.length} providers` },
];

/** The index down the left margin, in the same hairline idiom as the catalog's CategoryNav. */
export function LlmNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="LLM sheets">
      <div className="eyebrow border-b border-rule pb-2">Sheets</div>
      <ul>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 border-b border-rule/60 py-2 text-left text-sm transition-colors",
                  active ? "text-stamp" : "text-graphite hover:text-ink",
                )}
              >
                <span className={cn("truncate", active && "font-medium")}>{link.label}</span>
                <span className="figure shrink-0 text-xs text-graphite">{link.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
