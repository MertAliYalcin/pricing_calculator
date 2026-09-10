"use client";

import { Button } from "@/components/ui/button";

/** Triggers the browser's native print dialog, which offers "Save as PDF" on every platform — no server-side PDF dependency needed. Print-only CSS on the estimate page hides site chrome and actions so the output is just the estimate. */
export function ExportPdfButton() {
  return (
    <Button variant="outline" className="rounded-sm border-rule bg-transparent" onClick={() => window.print()}>
      Export PDF
    </Button>
  );
}
