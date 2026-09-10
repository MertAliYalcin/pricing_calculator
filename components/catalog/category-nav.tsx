"use client";

import type { CatalogCategory } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** The index down the left margin: every category, and how many items it holds. */
export function CategoryNav({
  categories,
  activeCategoryId,
  onSelect,
}: {
  categories: CatalogCategory[];
  activeCategoryId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const total = categories.reduce((sum, c) => sum + c.itemCount, 0);
  const rows = [{ id: null, name: "All items", itemCount: total }, ...categories];

  return (
    <nav aria-label="Categories">
      <div className="eyebrow border-b border-rule pb-2">Categories</div>
      <ul>
        {rows.map((row) => {
          const active = activeCategoryId === row.id;
          return (
            <li key={row.id ?? "all"}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 border-b border-rule/60 py-2 text-left text-sm transition-colors",
                  active ? "text-stamp" : "text-graphite hover:text-ink",
                )}
              >
                <span title={row.name} className={cn("truncate", active && "font-medium")}>{row.name}</span>
                <span className="figure shrink-0 text-xs text-graphite">{row.itemCount}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
