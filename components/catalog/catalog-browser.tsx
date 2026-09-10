"use client";

import { useMemo, useState } from "react";
import type { CatalogCategory, CatalogItem } from "@/lib/catalog";
import type { DraftView } from "@/lib/estimate";
import { Input } from "@/components/ui/input";
import { CategoryNav } from "@/components/catalog/category-nav";
import { ItemCard } from "@/components/catalog/item-card";
import { ItemFormDialog, type CatalogParameterRef } from "@/components/catalog/item-form-dialog";
import { CatalogDraftPanel } from "@/components/catalog/catalog-draft-panel";
import { Button } from "@/components/ui/button";

export function CatalogBrowser({
  categories,
  items,
  parameters,
  draft,
}: {
  categories: CatalogCategory[];
  items: CatalogItem[];
  parameters: CatalogParameterRef[];
  draft: DraftView;
}) {
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategoryId && item.categoryId !== activeCategoryId) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q) ||
        (item.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, activeCategoryId]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      map.set(item.categoryName, [...(map.get(item.categoryName) ?? []), item]);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
      <aside className="lg:w-52 lg:shrink-0">
        <div className="lg:sticky lg:top-8">
          <CategoryNav
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelect={setActiveCategoryId}
          />
          <div className="mt-6">
            <label htmlFor="catalog-search" className="eyebrow">
              Find an item
            </label>
            <Input
              id="catalog-search"
              placeholder="Search by name or note"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-2 h-9 bg-leaf"
            />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-12 xl:flex xl:flex-row-reverse xl:items-start xl:gap-12 xl:space-y-0">
        <div className="xl:w-72 xl:shrink-0">
          <CatalogDraftPanel draft={draft} />
        </div>

        <div className="min-w-0 flex-1 space-y-12">
          <div className="flex justify-end">
            <ItemFormDialog
              mode="create"
              categories={categories}
              parameters={parameters}
              trigger={
                <Button type="button" size="sm">
                  New item
                </Button>
              }
            />
          </div>

          {[...grouped.entries()].map(([categoryName, categoryItems]) => (
            <section key={categoryName}>
              <div className="mb-4 flex items-baseline justify-between border-b border-ink/15 pb-1.5">
                <h2 className="text-xl leading-none">{categoryName}</h2>
                <span className="eyebrow">
                  {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {categoryItems.map((item) => (
                  <ItemCard key={item.id} item={item} categories={categories} parameters={parameters} />
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="border border-dashed border-rule px-6 py-12 text-center">
              <p className="text-sm text-ink">Nothing matches that search.</p>
              <p className="annot mt-1 text-sm">Clear the search box or pick another category.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
