import { createServerFn } from "@tanstack/react-start";

export interface CalendarEvent {
  id: string;
  type: "fomc" | "earnings";
  title: string;
  symbol?: string;
  date: string; // YYYY-MM-DD (ET)
  timeEt?: string; // e.g. "14:00" or "BMO" / "AMC"
  datetimeUtc?: string; // ISO 8601 UTC timestamp for the event start
  timeLabel?: string; // human label, e.g. "Before open"
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

// Build an ISO timestamp for the given ET wall-clock time on `dateEt`.
// Handles EST (-05:00) vs EDT (-04:00) automatically.
function etToUtcIso(dateEt: string, hh: number, mm: number): string {
  const [y, m, d] = dateEt.split("-").map(Number);
  // Probe ~noon ET to read the active offset for that day.
  const probe = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value;
  const offset = tz === "EDT" ? "-04:00" : "-05:00";
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(
    `${dateEt}T${pad(hh)}:${pad(mm)}:00${offset}`,
  ).toISOString();
}

const EARNINGS_CACHE_TTL_MS = 5 * 60 * 1000;
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
      const requested = sym.toUpperCase();
      return (j.earningsCalendar ?? [])
        // Finnhub occasionally returns rows for other symbols in the window;
        // keep only the exact requested ticker.
        .filter(
          (row) =>
            row.date && row.symbol?.toUpperCase() === requested,
        )
        .map((row): CalendarEvent => {
          const hour = (row.hour ?? "").toLowerCase();
          let hh = 12;
          let mm = 0;
          let label = "Time TBA";
          let timeEt = "Time TBA";
          if (hour === "bmo") {
            hh = 8; mm = 30;
            label = "Before open";
            timeEt = "08:30 ET (before open)";
          } else if (hour === "amc") {
            hh = 16; mm = 5;
            label = "After close";
            timeEt = "16:05 ET (after close)";
          } else if (/^\d{1,2}:\d{2}$/.test(hour)) {
            const [h, m] = hour.split(":").map(Number);
            hh = h; mm = m;
            label = "During session";
            timeEt = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} ET`;
          }
          return {
            id: `earn-${row.symbol}-${row.date}`,
            type: "earnings",
            title: `${row.symbol} earnings`,
            symbol: row.symbol,
            date: row.date!,
            timeEt,
            timeLabel: label,
            datetimeUtc: etToUtcIso(row.date!, hh, mm),
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
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

export const fetchUpcomingEvents = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[]; days?: number }) => {
    const symbols = Array.isArray(input?.symbols)
      ? input.symbols
          .filter(
            (s): s is string =>
              typeof s === "string" &&
              s.length > 0 &&
              s.length <= 20 &&
              !s.includes("."), // skip non-US tickers (no Finnhub free coverage)
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
      timeLabel: "Statement 14:00 ET",
      datetimeUtc: etToUtcIso(m.date, 14, 0),
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

    // Drop events whose start time has already passed (e.g. an "AMC today"
    // report that already happened — it shouldn't keep showing as upcoming).
    const nowMs = Date.now();
    const events = [...fomcEvents, ...earnings]
      .filter((e) => {
        if (!e.datetimeUtc) return true;
        // 30-min grace so live events stay visible during the event window.
        return new Date(e.datetimeUtc).getTime() + 30 * 60_000 > nowMs;
      })
      .sort((a, b) => {
        const at = a.datetimeUtc ? new Date(a.datetimeUtc).getTime() : 0;
        const bt = b.datetimeUtc ? new Date(b.datetimeUtc).getTime() : 0;
        if (at !== bt) return at - bt;
        return a.date.localeCompare(b.date);
      });
    earningsCache = { at: Date.now(), key: cacheKey, data: events };
    return { events, source: "Federal Reserve + Finnhub" };
  });
