import { useEffect, useState, useCallback } from "react";

export interface EarningsReminder {
  ticker: string;
  earningsDate: string; // YYYY-MM-DD
  remindOn: string; // YYYY-MM-DD
  createdAt: number;
}

const REMINDERS_KEY = "earnings-reminders-v1";
const REVIEWED_KEY = "earnings-reviewed-v1";

function readReminders(): EarningsReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReminders(r: EarningsReminder[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDERS_KEY, JSON.stringify(r));
  window.dispatchEvent(new Event("earnings-reminders-changed"));
}

function readReviewed(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REVIEWED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeReviewed(r: Record<string, number>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEWED_KEY, JSON.stringify(r));
  window.dispatchEvent(new Event("earnings-reviewed-changed"));
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function reminderKey(ticker: string, date: string): string {
  return `${ticker.toUpperCase()}|${date}`;
}

export function useReminders() {
  const [reminders, setReminders] = useState<EarningsReminder[]>(() =>
    readReminders(),
  );
  useEffect(() => {
    const sync = () => setReminders(readReminders());
    window.addEventListener("earnings-reminders-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("earnings-reminders-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((r: EarningsReminder) => {
    const key = reminderKey(r.ticker, r.earningsDate);
    const next = readReminders().filter(
      (x) => reminderKey(x.ticker, x.earningsDate) !== key,
    );
    next.push(r);
    writeReminders(next);
  }, []);

  const remove = useCallback((ticker: string, earningsDate: string) => {
    const key = reminderKey(ticker, earningsDate);
    writeReminders(
      readReminders().filter(
        (x) => reminderKey(x.ticker, x.earningsDate) !== key,
      ),
    );
  }, []);

  return { reminders, add, remove };
}

export function useReviewed() {
  const [reviewed, setReviewed] = useState<Record<string, number>>(() =>
    readReviewed(),
  );
  useEffect(() => {
    const sync = () => setReviewed(readReviewed());
    window.addEventListener("earnings-reviewed-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("earnings-reviewed-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const markReviewed = useCallback((ticker: string, date: string) => {
    const next = { ...readReviewed(), [reminderKey(ticker, date)]: Date.now() };
    writeReviewed(next);
  }, []);

  const isReviewed = useCallback(
    (ticker: string, date: string) =>
      Boolean(reviewed[reminderKey(ticker, date)]),
    [reviewed],
  );

  return { reviewed, markReviewed, isReviewed };
}