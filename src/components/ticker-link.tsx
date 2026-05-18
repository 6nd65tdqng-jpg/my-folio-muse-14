import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Renders a ticker symbol as a link to the Analytics page, pre-selecting
 * that ticker via the `?ticker=` search param.
 */
export function TickerLink({
  ticker,
  children,
  className,
  title,
}: {
  ticker: string;
  children?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Link
      to="/analytics"
      search={{ ticker: ticker.toUpperCase() }}
      title={title ?? `View ${ticker} analytics`}
      className={cn(
        "underline-offset-2 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline outline-none",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children ?? ticker}
    </Link>
  );
}
