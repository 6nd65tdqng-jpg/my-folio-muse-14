import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronRight } from "lucide-react";
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

export function UpcomingEarningsWidget() {
  const events = useUpcomingEvents();

  const next3 = useMemo(
    () => (events ?? []).filter((e) => e.type === "earnings").slice(0, 3),
    [events],
  );

  if (events === null || next3.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-primary" /> Upcoming Earnings
        </CardTitle>
        <Link
          to="/earnings"
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          See all <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {next3.map((e) => {
          const d = daysFromToday(e.date);
          const urgent = d <= 7;
          return (
            <Link
              key={e.id}
              to="/earnings"
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">
                  {e.symbol}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtShortDate(e.date)}
                  {e.timeLabel ? ` · ${e.timeLabel}` : ""}
                </span>
              </div>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                  (urgent
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground")
                }
              >
                {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d}d`}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}