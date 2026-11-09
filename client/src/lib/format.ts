const fmtCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean) {
  const key = `${currency}:${compact}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
      compactDisplay: "short",
    });
    fmtCache.set(key, f);
  }
  return f;
}

export function money(amount: number | null | undefined, currency = "INR"): string {
  if (amount == null) return "—";
  return formatter(currency, false).format(amount);
}

/** Saleroom-style short form: ₹1.2 Cr, ₹45 L, $1.2M. */
export function moneyShort(amount: number | null | undefined, currency = "INR"): string {
  if (amount == null) return "—";
  if (currency === "INR") {
    if (amount >= 1_00_00_000) return `₹${trim(amount / 1_00_00_000)} Cr`;
    if (amount >= 1_00_000) return `₹${trim(amount / 1_00_000)} L`;
    return money(amount, currency);
  }
  return formatter(currency, true).format(amount);
}

const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, ""));

export function estimate(low: number, high: number, currency = "INR") {
  return `${moneyShort(low, currency)} – ${moneyShort(high, currency)}`;
}

export function dateTime(iso: string | Date) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dateRange(a: string, b: string) {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const end = new Date(b);
  return `${new Date(a).toLocaleDateString(undefined, o)} – ${end.toLocaleDateString(undefined, { ...o, year: "numeric" })}`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function lifespan(born: number | null, died: number | null) {
  if (!born) return "";
  return died ? `${born}–${died}` : `b. ${born}`;
}
