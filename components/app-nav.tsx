import Link from "next/link";
import { getDraftView } from "@/lib/estimate";
import { formatMoney } from "@/lib/money";
import { NavLinks } from "@/components/nav-links";

export async function Masthead() {
  const draft = await getDraftView();
  const lineCount = draft.lines.length;

  return (
    <header className="border-b border-rule bg-leaf print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8">
          <Link href="/" className="group">
            <span className="font-serif text-xl leading-none tracking-tight">Pricing Calculator</span>
            <span className="annot ml-2 text-sm">bill of quantities</span>
          </Link>
          <nav>
            <NavLinks />
          </nav>
        </div>

        {/* The estimate in progress is never out of sight. */}
        <Link
          href="/cart"
          className="group flex items-baseline gap-3 self-start rounded-sm border border-rule px-3 py-1.5 transition-colors hover:border-stamp sm:self-auto"
        >
          <span className="eyebrow">
            {lineCount === 0 ? "Draft empty" : `Draft · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
          </span>
          <span className="figure text-sm font-medium text-stamp">{formatMoney(draft.total)}</span>
          {draft.hasErrors && (
            <span className="eyebrow text-flag" title="Some lines could not be evaluated">
              !
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
