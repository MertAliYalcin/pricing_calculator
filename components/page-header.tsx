import type { ReactNode } from "react";

/** The document head every page opens with: what sheet you are on, and what it is for. */
export function PageHeader({
  eyebrow,
  title,
  note,
  action,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-1 text-3xl leading-none">{title}</h1>
        {note && <p className="annot mt-2 text-sm">{note}</p>}
      </div>
      {action}
    </div>
  );
}
