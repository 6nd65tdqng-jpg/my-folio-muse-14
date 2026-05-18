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
  const today = todayEt();

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
            const isToday = e.date === today;
            const Icon = e.type === "fomc" ? Megaphone : FileBarChart2;
            return (
              <li
                key={e.id}
                className={
                  "rounded-md border border-sidebar-border/60 px-2 py-1.5 text-[11px] leading-tight " +
                  (isToday ? "bg-primary/10 border-primary/40" : "")
                }
                title={`${e.title} — ${e.timeEt ?? ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 font-medium">
                    <Icon className="h-3 w-3 shrink-0" />
                    {e.symbol ?? "FOMC"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {isToday ? "Today" : fmtDate(e.date)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {e.timeEt ?? "Time TBA"}
                </div>
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
  const today = todayEt();
  if (!events) return null;
  const todays = events.filter((e) => e.date === today);
  if (todays.length === 0) return null;
  return (
    <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <CalendarDays className="h-3 w-3" /> Today
      </div>
      <ul className="space-y-0.5">
        {todays.map((e) => {
          const Icon = e.type === "fomc" ? Megaphone : FileBarChart2;
          return (
            <li key={e.id} className="flex items-center gap-1.5">
              <Icon className="h-3 w-3 shrink-0 text-primary" />
              <span className="font-medium">
                {e.symbol ? `${e.symbol} earnings` : e.title}
              </span>
              <span className="text-muted-foreground">— {e.timeEt}</span>
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
