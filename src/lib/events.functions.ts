import { createServerFn } from "@tanstack/react-start";

export interface CalendarEvent {
  id: string;
  type: "fomc" | "earnings";
  title: string;
  symbol?: string;
  date: string; // YYYY-MM-DD (ET)
  timeEt?: string; // e.g. "14:00" or "BMO" / "AMC"
  detail?: string;
}

// FOMC meeting schedule (statement released ~2:00pm ET on the second day).
// Sourced from the Federal Reserve official calendar.
// https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC: Array<{ date: string; label: string }> = [
  { date: "2025-01-29", label: "FOMC Statement & Press Conference" },
  { date: "2025-03-19", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2025-05-07", label: "FOMC Statement & Press Conference" },
  { date: "2025-06-18", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2025-07-30", label: "FOMC Statement & Press Conference" },
  { date: "2025-09-17", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2025-10-29", label: "FOMC Statement & Press Conference" },
  { date: "2025-12-10", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2026-01-28", label: "FOMC Statement & Press Conference" },
  { date: "2026-03-18", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2026-04-29", label: "FOMC Statement & Press Conference" },
  { date: "2026-06-17", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2026-07-29", label: "FOMC Statement & Press Conference" },
  { date: "2026-09-16", label: "FOMC Statement, SEP & Press Conference" },
  { date: "2026-10-28", label: "FOMC Statement & Press Conference" },
  { date: "2026-12-09", label: "FOMC Statement, SEP & Press Conference" },
];

function todayEt(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function addDaysEt(base: string, days: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const EARNINGS_CACHE_TTL_MS = 15 * 60 * 1000;
let earningsCache: {
  at: number;
  key: string;
  data: CalendarEvent[];
} | null = null;

interface FinnhubEarningsRow {
  date?: string;
  hour?: string; // "bmo" | "amc" | ""
  symbol?: string;
  epsEstimate?: number | null;
  revenueEstimate?: number | null;
}

async function fetchFinnhubEarnings(
  symbols: string[],
  from: string,
  to: string,
  apiKey: string,
): Promise<CalendarEvent[]> {
  if (symbols.length === 0) return [];
  // Finnhub returns the whole window for a single symbol; query per-symbol so
  // we only get rows we actually care about and stay under free-tier quotas.
  const settled = await Promise.allSettled(
    symbols.map(async (sym) => {
      const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(
        sym,
      )}&token=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${sym}: ${r.status}`);
      const j = (await r.json()) as { earningsCalendar?: FinnhubEarningsRow[] };
      return (j.earningsCalendar ?? []).map((row): CalendarEvent => {
        const when =
          row.hour === "bmo"
            ? "Before market open"
            : row.hour === "amc"
              ? "After market close"
              : row.hour
                ? row.hour
                : "Time TBA";
        return {
          id: `earn-${row.symbol}-${row.date}`,
          type: "earnings",
          title: `${row.symbol} earnings`,
          symbol: row.symbol,
          date: row.date ?? "",
          timeEt: when,
          detail:
            row.epsEstimate != null
              ? `EPS est ${row.epsEstimate}`
              : undefined,
        };
      });
    }),
  );
  const out: CalendarEvent[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value.filter((e) => e.date));
  }
  return out;
}

export const fetchUpcomingEvents = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[]; days?: number }) => {
    const symbols = Array.isArray(input?.symbols)
      ? input.symbols
          .filter(
            (s) =>
              typeof s === "string" &&
              s.length > 0 &&
              s.length <= 20 &&
              !s.includes(".") && // skip non-US tickers (no Finnhub coverage)
              !/^[a-z]+$/i.test(s) === false,
          )
          .slice(0, 50)
      : [];
    const days = Math.min(60, Math.max(1, Math.floor(Number(input?.days) || 30)));
    return { symbols, days };
  })
  .handler(async ({ data }): Promise<{ events: CalendarEvent[]; source: string }> => {
    const today = todayEt();
    const to = addDaysEt(today, data.days);
    const cacheKey = `${today}|${data.days}|${data.symbols.sort().join(",")}`;

    if (
      earningsCache &&
      earningsCache.key === cacheKey &&
      Date.now() - earningsCache.at < EARNINGS_CACHE_TTL_MS
    ) {
      return { events: earningsCache.data, source: "Federal Reserve + Finnhub (cached)" };
    }

    const fomcEvents: CalendarEvent[] = FOMC.filter(
      (m) => m.date >= today && m.date <= to,
    ).map((m) => ({
      id: `fomc-${m.date}`,
      type: "fomc",
      title: "FOMC Meeting",
      date: m.date,
      timeEt: "14:00 ET (statement) · 14:30 ET (press conf)",
      detail: m.label,
    }));

    let earnings: CalendarEvent[] = [];
    const key = process.env.FINNHUB_API_KEY;
    if (key && data.symbols.length > 0) {
      try {
        earnings = await fetchFinnhubEarnings(data.symbols, today, to, key);
      } catch (e) {
        console.warn("earnings fetch failed", e);
      }
    }

    const events = [...fomcEvents, ...earnings].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    earningsCache = { at: Date.now(), key: cacheKey, data: events };
    return { events, source: "Federal Reserve + Finnhub" };
  });
