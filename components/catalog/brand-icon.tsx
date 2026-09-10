import type { ResolvedIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** A simple-icons brand logo (CC0), rendered as an inline SVG in the brand's own color. */
export function BrandIcon({ icon, className }: { icon: ResolvedIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={icon.title}
      className={cn("h-5 w-5 shrink-0", className)}
      fill={`#${icon.hex}`}
    >
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  );
}
