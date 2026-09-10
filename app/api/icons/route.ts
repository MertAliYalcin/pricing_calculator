import { NextResponse } from "next/server";
import { resolveIcon, searchIcons, type ResolvedIcon } from "@/lib/icons";

/**
 * Icon search for the item form's logo picker — keeps simple-icons' ~450KB
 * catalog server-side, never bundled to the client. Each result is resolved
 * to its full path data too: the result set is small (a search's top ~20
 * matches), so sending that over the wire is cheap — unlike the full catalog.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = searchIcons(q)
    .map((icon) => resolveIcon(icon.slug))
    .filter((icon): icon is ResolvedIcon => icon !== null);
  return NextResponse.json(results);
}
