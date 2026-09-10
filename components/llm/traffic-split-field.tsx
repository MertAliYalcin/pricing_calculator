"use client";

/**
 * How traffic divides between the two models. Edited as a whole percentage because that is how the
 * workbook states it ("N1/N2 Traffic: 50/50"); the share (0–1) is what leaves the component, so
 * no caller has to remember which convention it is holding.
 */
export function TrafficSplitField({
  sharePct,
  onChange,
}: {
  sharePct: number;
  onChange: (sharePct: number) => void;
}) {
  return (
    <div>
      <label className="eyebrow mb-2 block" htmlFor="n1-traffic-share">
        N1 share of traffic
      </label>
      <div className="flex items-baseline gap-2">
        <input
          id="n1-traffic-share"
          type="number"
          min={0}
          max={100}
          step={1}
          value={sharePct}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.min(100, Math.max(0, next)));
          }}
          className="w-20 border-0 border-b border-rule bg-transparent py-1 text-right text-sm focus:border-stamp focus:outline-none"
        />
        <span className="text-sm text-graphite">%</span>
      </div>
      <div className="annot mt-2 text-xs">
        N1 {sharePct}% / N2 {100 - sharePct}%
      </div>
    </div>
  );
}
