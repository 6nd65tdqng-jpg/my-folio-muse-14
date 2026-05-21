import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  RefreshCw,
  Bell,
  BellRing,
  Newspaper,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePortfolio } from "@/lib/portfolio-store";
import {
  fetchUpcomingEvents,
  type CalendarEvent,
} from "@/lib/events.functions";
import {
  useReminders,
  useReviewed,
  addDaysIso,
  reminderKey,
} from "@/lib/earnings-reminders";

const CACHE_KEY = "earnings-cache-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPayload {
  at: number;
  symbolsKey: string;
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(iso: string | undefined, dateOnly: string): number {
  const target = iso ? new Date(iso) : new Date(`${dateOnly}T12:00:00Z`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

function fmtFullDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfWeekIso(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Week starts Monday
  const day = dt.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

function fmtWeekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `Week of ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })}`;
}

function urgencyTone(days: number): {
  border: string;
  badge: string;
  label: string;
} {
  if (days < 0)
    return {
      border: "border-muted",
      badge: "bg-muted text-muted-foreground",
      label: `${Math.abs(days)}d ago`,
    };
  if (days === 0)
    return {
      border: "border-destructive",
      badge: "bg-destructive/15 text-destructive",
      label: "Today",
    };
  if (days <= 7)
    return {
      border: "border-destructive/60",
      badge: "bg-destructive/15 text-destructive",
      label: days === 1 ? "Tomorrow" : `In ${days} days`,
    };
  if (days <= 14)
    return {
      border: "border-amber-500/60",
      badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      label: `In ${days} days`,
    };
  return {
    border: "border-blue-500/50",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    label: `In ${days} days`,
  };
}

export function EarningsPage() {
  const holdings = usePortfolio((s) => s.holdings);
  const symbols = useMemo(
    () =>
      Array.from(
        new Set(
          holdings
            .filter((h) => h.assetType !== "crypto" && h.quantity > 0)
            .map((h) => h.ticker.toUpperCase())
            .filter((s) => !s.includes(".")),
        ),
      ),
    [holdings],
  );
  const symbolsKey = symbols.slice().sort().join(",");
  const nameByTicker = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holdings) map.set(h.ticker.toUpperCase(), h.name);
    return map;
  }, [holdings]);

  const [upcoming, setUpcoming] = useState<CalendarEvent[] | null>(null);
  const [past, setPast] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      // Try cache
      if (!force && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached: CachedPayload = JSON.parse(raw);
            if (
              cached.symbolsKey === symbolsKey &&
              Date.now() - cached.at < CACHE_TTL_MS
            ) {
              setUpcoming(cached.upcoming);
              setPast(cached.past);
              setLastUpdated(cached.at);
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      if (symbols.length === 0) {
        setUpcoming([]);
        setPast([]);
        setLastUpdated(Date.now());
        return;
      }

      setLoading(true);
      try {
        const today = todayIso();
        const past30 = addDaysIso(today, -30);
        const [up, pa] = await Promise.all([
          fetchUpcomingEvents({ data: { symbols, days: 30 } }),
          fetchUpcomingEvents({
            data: { symbols, days: 30, from: past30, includePast: true },
          }),
        ]);
        const upcomingFiltered = up.events.filter((e) => e.type === "earnings");
        const pastFiltered = pa.events
          .filter((e) => e.type === "earnings" && e.date < today)
          .sort((a, b) => b.date.localeCompare(a.date));
        setUpcoming(upcomingFiltered);
        setPast(pastFiltered);
        const now = Date.now();
        setLastUpdated(now);
        if (typeof window !== "undefined") {
          const payload: CachedPayload = {
            at: now,
            symbolsKey,
            upcoming: upcomingFiltered,
            past: pastFiltered,
          };
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        }
      } catch (e) {
        console.warn("earnings fetch failed", e);
        setError("Unable to load earnings data.");
      } finally {
        setLoading(false);
      }
    },
    [symbols, symbolsKey],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const thisWeek = useMemo(
    () =>
      (upcoming ?? []).filter((e) => {
        const d = daysUntil(e.datetimeUtc, e.date);
        return d >= 0 && d <= 7;
      }),
    [upcoming],
  );

  const groupedNext30 = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const e of upcoming ?? []) {
      const k = startOfWeekIso(e.date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [upcoming]);

  const { reminders } = useReminders();
  const activeReminders = useMemo(() => {
    const today = todayIso();
    return reminders
      .filter((r) => r.remindOn >= today)
      .sort((a, b) => a.remindOn.localeCompare(b.remindOn));
  }, [reminders]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const mins = Math.round((Date.now() - lastUpdated) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  }, [lastUpdated]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" />
            Earnings Calendar
          </h1>
          <p className="text-xs text-muted-foreground">
            {lastUpdatedLabel
              ? `Last updated ${lastUpdatedLabel}`
              : "Loading…"}
            {" · "}Filtered to {symbols.length} portfolio holding
            {symbols.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              Refresh
            </Button>
          </CardContent>
        </Card>
      )}

      {activeReminders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BellRing className="h-4 w-4 text-primary" /> Active reminders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {activeReminders.map((r) => (
              <ActiveReminderRow
                key={reminderKey(r.ticker, r.earningsDate)}
                ticker={r.ticker}
                earningsDate={r.earningsDate}
                remindOn={r.remindOn}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">
            This Week
            {thisWeek.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {thisWeek.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="month">
            Next 30 Days
            {(upcoming?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">
                {upcoming!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="week" className="space-y-3 pt-3">
          {upcoming === null ? (
            <SkeletonGrid />
          ) : thisWeek.length === 0 ? (
            <EmptyState text="No earnings this week 🎉" />
          ) : (
            <CardGrid>
              {thisWeek.map((e) => (
                <EarningsCard
                  key={e.id}
                  event={e}
                  companyName={nameByTicker.get(e.symbol ?? "") ?? ""}
                />
              ))}
            </CardGrid>
          )}
        </TabsContent>

        <TabsContent value="month" className="space-y-5 pt-3">
          {upcoming === null ? (
            <SkeletonGrid />
          ) : upcoming.length === 0 ? (
            <EmptyState text="No upcoming earnings in the next 30 days." />
          ) : (
            groupedNext30.map(([weekIso, events]) => (
              <div key={weekIso} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {fmtWeekLabel(weekIso)}
                </h2>
                <CardGrid>
                  {events.map((e) => (
                    <EarningsCard
                      key={e.id}
                      event={e}
                      companyName={nameByTicker.get(e.symbol ?? "") ?? ""}
                    />
                  ))}
                </CardGrid>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 pt-3">
          {past === null ? (
            <SkeletonGrid />
          ) : past.length === 0 ? (
            <EmptyState text="No earnings in the last 30 days." />
          ) : (
            <CardGrid>
              {past.map((e) => (
                <EarningsCard
                  key={e.id}
                  event={e}
                  companyName={nameByTicker.get(e.symbol ?? "") ?? ""}
                  isPast
                />
              ))}
            </CardGrid>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <CardGrid>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="h-40" />
        </Card>
      ))}
    </CardGrid>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {text}
      </CardContent>
    </Card>
  );
}

function ActiveReminderRow({
  ticker,
  earningsDate,
  remindOn,
}: {
  ticker: string;
  earningsDate: string;
  remindOn: string;
}) {
  const { remove } = useReminders();
  const { markReviewed } = useReviewed();
  const today = todayIso();
  const isDue = remindOn <= today;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
      <div className="text-xs">
        <span className="font-semibold">{ticker}</span> earnings on{" "}
        {fmtFullDate(earningsDate)} —{" "}
        <span className={cn(isDue && "text-primary font-medium")}>
          review {isDue ? "due today" : `on ${fmtFullDate(remindOn)}`}
        </span>
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            markReviewed(ticker, earningsDate);
            remove(ticker, earningsDate);
          }}
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done
        </Button>
      </div>
    </div>
  );
}

function EarningsCard({
  event,
  companyName,
  isPast,
}: {
  event: CalendarEvent;
  companyName: string;
  isPast?: boolean;
}) {
  const ticker = event.symbol ?? "";
  const days = daysUntil(event.datetimeUtc, event.date);
  const tone = urgencyTone(days);
  const { reminders, add } = useReminders();
  const { isReviewed, markReviewed } = useReviewed();
  const existing = reminders.find(
    (r) => reminderKey(r.ticker, r.earningsDate) === reminderKey(ticker, event.date),
  );
  const [open, setOpen] = useState(false);
  const [daysAfter, setDaysAfter] = useState(2);

  const reviewed = isReviewed(ticker, event.date);

  return (
    <Card className={cn("border-l-4 transition", tone.border)}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-xl font-bold leading-tight">
              {ticker}
            </div>
            {companyName && (
              <div className="truncate text-xs text-muted-foreground">
                {companyName}
              </div>
            )}
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tone.badge,
            )}
          >
            {tone.label}
          </span>
        </div>

        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span aria-hidden>📊</span>
            <span className="font-medium">{fmtFullDate(event.date)}</span>
          </div>
          {event.timeLabel && (
            <div className="text-muted-foreground">
              ⏰ {event.timeLabel}
              {event.timeEt ? ` · ${event.timeEt}` : ""}
            </div>
          )}
          {event.detail && (
            <div className="text-muted-foreground">{event.detail}</div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {isPast ? (
            <Button
              size="sm"
              variant={reviewed ? "secondary" : "outline"}
              className="h-7 gap-1 text-xs"
              onClick={() => markReviewed(ticker, event.date)}
              disabled={reviewed}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {reviewed ? "Reviewed ✅" : "Mark as Reviewed"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={existing ? "secondary" : "outline"}
              className="h-7 gap-1 text-xs"
              onClick={() => setOpen(true)}
            >
              <Bell className="h-3.5 w-3.5" />
              {existing ? "Reminder set" : "Set Reminder"}
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
          >
            <Link to="/news">
              <Newspaper className="h-3.5 w-3.5" /> View News
            </Link>
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remind me about {ticker}</DialogTitle>
            <DialogDescription>
              Earnings on {fmtFullDate(event.date)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium" htmlFor="days-after">
              Remind me this many days after earnings
            </label>
            <input
              id="days-after"
              type="number"
              min={0}
              max={30}
              value={daysAfter}
              onChange={(e) => setDaysAfter(Number(e.target.value) || 0)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Reminder date:{" "}
              <span className="font-mono">
                {fmtFullDate(addDaysIso(event.date, daysAfter))}
              </span>
            </p>
          </div>
          <DialogFooter>
            {existing && (
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={() => {
                add({
                  ticker,
                  earningsDate: event.date,
                  remindOn: addDaysIso(event.date, daysAfter),
                  createdAt: Date.now(),
                });
                setOpen(false);
              }}
            >
              Save reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}