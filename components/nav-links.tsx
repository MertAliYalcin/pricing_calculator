"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Catalog" },
  { href: "/cart", label: "Estimate" },
  { href: "/parameters", label: "Parameters" },
  { href: "/llms", label: "LLMs" },
  { href: "/estimates", label: "Saved" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-6">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "eyebrow block border-b-2 pb-1 pt-1 transition-colors hover:text-ink",
                active ? "border-stamp text-stamp" : "border-transparent",
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
