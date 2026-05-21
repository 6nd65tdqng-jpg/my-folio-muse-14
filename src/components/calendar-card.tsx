import { useMemo } from "react";
import { CalendarDays, Megaphone, FileBarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUpcomingEvents } from "@/components/events-calendar";

function fmtShortDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function daysFromToday(dateOnly: string): number {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  return Math.round((target.getTime() - todayUtc.getTime()) / 86_400_000);
}

export function CalendarCard() {
  const events = useUpcomingEvents();

  const upcoming = useMemo(() => (events ?? []).slice(0, 6), [events]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-primary" /> Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {events === null ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Loading events…
          </p>
        ) : upcoming.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No events in the next 30 days.
          </p>
        ) : (
          upcoming.map((e) => {
            const d = daysFromToday(e.date);
            const Icon = e.type === "fomc" ? Megaphone : FileBarChart2;
            const urgent = d <= 1;
            return (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-sm font-semibold">
                    {e.symbol ?? "FOMC"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {fmtShortDate(e.date)}
                    {e.timeLabel ? ` · ${e.timeLabel}` : ""}
                  </span>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                    (urgent
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d}d`}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}