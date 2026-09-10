"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedIcon } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandIcon } from "@/components/catalog/brand-icon";

/**
 * Search-as-you-type picker over simple-icons' catalog (CC0-licensed brand
 * logos). Note some marks — Amazon/AWS and Microsoft/Azure among them —
 * were removed from the package at the trademark holders' request, so those
 * brands simply won't turn up here.
 */
export function IconPicker({ value, onChange }: { value: ResolvedIcon | null; onChange: (icon: ResolvedIcon | null) => void }) {
  const [query, setQuery] = useState(value?.title ?? "");
  const [results, setResults] = useState<ResolvedIcon[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (value) onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = next.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/icons?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        setResults(await res.json());
        setOpen(true);
      }
    }, 200);
  }

  function select(icon: ResolvedIcon) {
    onChange(icon);
    setQuery(icon.title);
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <Label htmlFor="item-icon">Icon</Label>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-rule">
          {value ? <BrandIcon icon={value} /> : <span className="annot text-xs">—</span>}
        </div>
        <Input
          id="item-icon"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search brand logos, e.g. postgresql"
          className="flex-1"
        />
        {value && (
          <button type="button" className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-rule bg-popover shadow-md">
          {results.map((icon) => (
            <li key={icon.slug}>
              <button
                type="button"
                onClick={() => select(icon)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <BrandIcon icon={icon} />
                <span title={icon.title} className="truncate">{icon.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
