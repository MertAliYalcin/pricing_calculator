import { readFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_DIR = path.join(process.cwd(), "node_modules", "simple-icons");

export type IconSummary = { slug: string; title: string; hex: string };
export type ResolvedIcon = IconSummary & { path: string };

let catalogCache: Map<string, IconSummary> | null = null;

/**
 * simple-icons' full catalog (~3.5k brands, CC0-licensed) as {slug -> title/hex},
 * loaded once per server process and cached. Individual icon path data is read
 * on demand from its own .svg file, never bundled to the client.
 *
 * Note: some trademark holders (Amazon/AWS, Microsoft/Azure among them) have had
 * their marks removed from simple-icons at their request — those brands simply
 * won't appear in search results here.
 */
function loadCatalog(): Map<string, IconSummary> {
  if (!catalogCache) {
    const raw = readFileSync(path.join(PACKAGE_DIR, "data", "simple-icons.json"), "utf8");
    const data = JSON.parse(raw) as { slug: string; title: string; hex: string }[];
    catalogCache = new Map(data.map((d) => [d.slug, { slug: d.slug, title: d.title, hex: d.hex }]));
  }
  return catalogCache;
}

/** Case-insensitive search over slug and title, most relevant first (startsWith beats includes). */
export function searchIcons(query: string, limit = 20): IconSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const catalog = loadCatalog();

  const starts: IconSummary[] = [];
  const contains: IconSummary[] = [];
  for (const icon of catalog.values()) {
    const title = icon.title.toLowerCase();
    if (title.startsWith(q) || icon.slug.startsWith(q)) starts.push(icon);
    else if (title.includes(q) || icon.slug.includes(q)) contains.push(icon);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Resolves a stored slug into title/hex/path, or null if the slug is unknown (e.g. removed from the package since it was saved). */
export function resolveIcon(slug: string | null | undefined): ResolvedIcon | null {
  if (!slug) return null;
  const meta = loadCatalog().get(slug);
  if (!meta) return null;

  try {
    const svg = readFileSync(path.join(PACKAGE_DIR, "icons", `${slug}.svg`), "utf8");
    const match = /<path\s+d="([^"]+)"/.exec(svg);
    if (!match) return null;
    return { ...meta, path: match[1] };
  } catch {
    return null;
  }
}

export function iconExists(slug: string): boolean {
  return loadCatalog().has(slug);
}
