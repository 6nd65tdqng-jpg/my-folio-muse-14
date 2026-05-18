import { useEffect, useState } from "react";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

// NYSE holidays. Format: YYYY-MM-DD => label.
// "early" entries close at 1:00pm ET.
const HOLIDAYS: Record<string, string> = {
  "2025-01-01": "New Year's Day",
  "2025-01-09": "National Day of Mourning (Carter)",
  "2025-01-20": "Martin Luther King Jr. Day",
  "2025-02-17": "Presidents' Day",
  "2025-04-18": "Good Friday",
  "2025-05-26": "Memorial Day",
  "2025-06-19": "Juneteenth",
  "2025-07-04": "Independence Day",
  "2025-09-01": "Labor Day",
  "2025-11-27": "Thanksgiving",
  "2025-12-25": "Christmas Day",
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Presidents' Day",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Presidents' Day",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving",
  "2027-12-24": "Christmas Day (observed)",
};

const EARLY_CLOSE: Record<string, string> = {
  "2025-07-03": "Day before Independence Day",
  "2025-11-28": "Day after Thanksgiving",
  "2025-12-24": "Christmas Eve",
  "2026-11-27": "Day after Thanksgiving",
  "2026-12-24": "Christmas Eve",
  "2027-11-26": "Day after Thanksgiving",
};

interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun
  dateKey: string; // YYYY-MM-DD in ET
}

function getEtParts(d: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    weekday: weekdayMap[map.weekday] ?? 0,
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

function fmtDuration(mins: number): string {
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Status {
  state: "open" | "closed";
  label: string;
  detail: string;
}

function computeStatus(now: Date): Status {
  const et = getEtParts(now);
  const minsNow = et.hour * 60 + et.minute;
  const isWeekend = et.weekday === 0 || et.weekday === 6;
  const holiday = HOLIDAYS[et.dateKey];
  const early = EARLY_CLOSE[et.dateKey];
  const closeMins = early ? 13 * 60 : 16 * 60; // 1pm or 4pm ET
  const openMins = 9 * 60 + 30;

  if (isWeekend) {
    return {
      state: "closed",
      label: "US Market Closed",
      detail: et.weekday === 6 ? "Weekend — reopens Mon 9:30am ET" : "Weekend — reopens Mon 9:30am ET",
    };
  }
  if (holiday) {
    return {
      state: "closed",
      label: "US Market Closed",
      detail: `Holiday — ${holiday}`,
    };
  }
  if (minsNow < openMins) {
    return {
      state: "closed",
      label: "US Market Pre-Open",
      detail: `Opens in ${fmtDuration(openMins - minsNow)} (9:30am ET)`,
    };
  }
  if (minsNow >= closeMins) {
    return {
      state: "closed",
      label: "US Market Closed",
      detail: early
        ? `Early close (${early}) — reopens next session 9:30am ET`
        : "Reopens next session 9:30am ET",
    };
  }
  const closeLabel = early ? "1:00pm ET (early close)" : "4:00pm ET";
  return {
    state: "open",
    label: "US Market Open",
    detail: `Closes in ${fmtDuration(closeMins - minsNow)} (${closeLabel})`,
  };
}

export function MarketStatus() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Reserve space without rendering text — avoids SSR hydration mismatch.
    return <div className="h-5 w-20 sm:w-44" aria-hidden />;
  }

  const status = computeStatus(now);
  const open = status.state === "open";

  return (
    <div
      className="flex items-center gap-1.5 leading-tight"
      title={`${status.label} — ${status.detail}`}
    >
      <Circle
        className={cn(
          "h-2 w-2 shrink-0 fill-current",
          open ? "text-[var(--success)]" : "text-muted-foreground",
        )}
      />
      {/* Mobile: compact single-line. */}
      <div className="flex flex-col sm:hidden">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            open ? "text-[var(--success)]" : "text-muted-foreground",
          )}
        >
          {open ? "Open" : "Closed"}
        </span>
        <span className="text-[9px] text-muted-foreground">{status.detail}</span>
      </div>
      {/* sm+: full label + detail. */}
      <div className="hidden flex-col text-[11px] sm:flex">
        <span
          className={cn(
            "font-semibold uppercase tracking-wider",
            open ? "text-[var(--success)]" : "text-muted-foreground",
          )}
        >
          {status.label}
        </span>
        <span className="text-[10px] text-muted-foreground">{status.detail}</span>
      </div>
    </div>
  );
}
