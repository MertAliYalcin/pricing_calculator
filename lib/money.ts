export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Round only for persistence/display. Never round intermediate formula steps. */
export function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundForPersistence(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
