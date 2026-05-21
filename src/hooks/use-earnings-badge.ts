import { useEffect, useState } from "react";
import { useUpcomingEvents } from "@/components/events-calendar";
import { useReminders } from "@/lib/earnings-reminders";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Badge count = upcoming earnings in the next 7 days + active reminders due today.
 */
export function useEarningsBadgeCount(): number {
  const events = useUpcomingEvents();
  const { reminders } = useReminders();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const today = todayIso();
    const horizon = addDaysIso(today, 7);
    const earningsCount = (events ?? []).filter(
      (e) => e.type === "earnings" && e.date >= today && e.date <= horizon,
    ).length;
    const dueReminders = reminders.filter((r) => r.remindOn <= today).length;
    setCount(earningsCount + dueReminders);
  }, [events, reminders]);

  return count;
}