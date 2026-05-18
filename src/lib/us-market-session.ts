// Shared US (NYSE) cash-session detection. Used by the header status pill
// and by the indices card to decide whether to show live cash prices or
// fall back to futures.

export const HOLIDAYS: Record<string, string> = {
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

export const EARLY_CLOSE: Record<string, string> = {
  "2025-07-03": "Day before Independence Day",
  "2025-11-28": "Day after Thanksgiving",
  "2025-12-24": "Christmas Eve",
  "2026-11-27": "Day after Thanksgiving",
  "2026-12-24": "Christmas Eve",
  "2027-11-26": "Day after Thanksgiving",
};

export interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun
  dateKey: string; // YYYY-MM-DD in ET
}

export function getEtParts(d: Date): EtParts {
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
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
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

export type SessionPhase =
  | "regular" // 9:30 – close (cash is live)
  | "pre" // weekday before 9:30
  | "post" // weekday after close, same day
  | "weekend"
  | "holiday";

export interface SessionInfo {
  phase: SessionPhase;
  cashOpen: boolean; // true only during "regular"
  reason?: string; // human label for non-regular phases (e.g. holiday name)
}

export function getUsMarketSession(now: Date = new Date()): SessionInfo {
  const et = getEtParts(now);
  const minsNow = et.hour * 60 + et.minute;
  const openMins = 9 * 60 + 30;
  const closeMins = EARLY_CLOSE[et.dateKey] ? 13 * 60 : 16 * 60;

  if (et.weekday === 0 || et.weekday === 6) {
    return { phase: "weekend", cashOpen: false, reason: "Weekend" };
  }
  const holiday = HOLIDAYS[et.dateKey];
  if (holiday) {
    return { phase: "holiday", cashOpen: false, reason: holiday };
  }
  if (minsNow < openMins) {
    return { phase: "pre", cashOpen: false, reason: "Pre-market" };
  }
  if (minsNow >= closeMins) {
    return {
      phase: "post",
      cashOpen: false,
      reason: EARLY_CLOSE[et.dateKey] ? "After hours (early close)" : "After hours",
    };
  }
  return { phase: "regular", cashOpen: true };
}

export function isUsCashMarketOpen(now: Date = new Date()): boolean {
  return getUsMarketSession(now).cashOpen;
}