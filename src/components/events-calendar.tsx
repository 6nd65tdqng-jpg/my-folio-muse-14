import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Megaphone, FileBarChart2 } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchUpcomingEvents, type CalendarEvent } from "@/lib/events.functions";

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const localTz =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

function tzAbbrev(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

function fmtTimeIn(iso: string | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${t} ${tzAbbrev(d, timeZone)}`;
}

function fmtDateIn(iso: string | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(d);
}

function isTodayLocal(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: localTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d) === fmt.format(new Date());
}

export function useUpcomingEvents() {
  const holdings = usePortfolio((s) => s.holdings);
  const symbols = useMemo(
    () =>
      holdings
        .filter((h) => h.assetType !== "crypto")
        .map((h) => h.ticker.toUpperCase())
        .filter((s) => !s.includes(".")),
    [holdings],
  );
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { events } = await fetchUpcomingEvents({
          data: { symbols, days: 30 },
        });
        if (!cancelled) setEvents(events);
      } catch (e) {
        console.warn("events fetch failed", e);
        if (!cancelled) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbols.join(",")]);

  return events;
}

export function EventsCalendarSidebar() {
  const events = useUpcomingEvents();

  if (events === null) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        Loading events…
      </div>
    );
  }
  const upcoming = events.slice(0, 6);

  return (
    <div className="space-y-1.5 px-2 py-2">
      <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarDays className="h-3 w-3" /> Calendar
      </div>
      {upcoming.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          No events in the next 30 days.
        </p>
      ) : (
        <ul className="space-y-1">
          {upcoming.map((e) => {
            const isToday = e.datetimeUtc
              ? isTodayLocal(e.datetimeUtc)
              : e.date === todayEt();
            const Icon = e.type === "fomc" ? Megaphone : FileBarChart2;
            const etTime = fmtTimeIn(e.datetimeUtc, "America/New_York");
            const localTime = fmtTimeIn(e.datetimeUtc, localTz);
            const localDate = fmtDateIn(e.datetimeUtc, localTz) ?? fmtDate(e.date);
            const sameTz = tzAbbrev(new Date(), localTz) === "EST" ||
              tzAbbrev(new Date(), localTz) === "EDT";
            return (
              <li
                key={e.id}
                className={
                  "rounded-md border border-sidebar-border/60 px-2 py-1.5 text-[11px] leading-tight " +
                  (isToday ? "bg-primary/10 border-primary/40" : "")
                }
                title={`${e.title} — ${e.timeEt ?? ""}${
                  localTime && !sameTz ? ` · ${localTime} local` : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 font-medium">
                    <Icon className="h-3 w-3 shrink-0" />
                    {e.symbol ?? "FOMC"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {isToday ? "Today" : localDate}
                  </span>
                </div>
                {etTime ? (
                  <div className="mt-0.5 space-y-0 text-[10px] text-muted-foreground">
                    <div className="truncate">
                      {etTime}
                      {e.timeLabel ? ` · ${e.timeLabel}` : ""}
                    </div>
                    {localTime && !sameTz && (
                      <div className="truncate font-mono text-foreground/70">
                        {localTime} (your time)
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {e.timeEt ?? "Time TBA"}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-1 pt-1 text-[9px] text-muted-foreground/70">
        Fed: Federal Reserve · Earnings: Finnhub
      </p>
    </div>
  );
}

export function TodaysEventsBanner() {
  const events = useUpcomingEvents();
  if (!events) return null;
  const todayEtKey = todayEt();
  const todays = events.filter((e) =>
    e.datetimeUtc ? isTodayLocal(e.datetimeUtc) : e.date === todayEtKey,
  );
  if (todays.length === 0) return null;
  const sameTz =
    tzAbbrev(new Date(), localTz) === "EST" ||
    tzAbbrev(new Date(), localTz) === "EDT";
  return (
    <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <CalendarDays className="h-3 w-3" /> Today
      </div>
      <ul className="space-y-0.5">
        {todays.map((e) => {
          const Icon = e.type === "fomc" ? Megaphone : FileBarChart2;
          const etTime = fmtTimeIn(e.datetimeUtc, "America/New_York");
          const localTime = fmtTimeIn(e.datetimeUtc, localTz);
          return (
            <li key={e.id} className="flex items-center gap-1.5">
              <Icon className="h-3 w-3 shrink-0 text-primary" />
              <span className="font-medium">
                {e.symbol ? `${e.symbol} earnings` : e.title}
              </span>
              <span className="text-muted-foreground">
                — {etTime ?? e.timeEt}
                {localTime && !sameTz ? ` · ${localTime} local` : ""}
              </span>
              {e.detail && (
                <span className="hidden text-muted-foreground sm:inline">
                  · {e.detail}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
