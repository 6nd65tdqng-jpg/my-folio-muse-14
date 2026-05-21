import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Newspaper } from "lucide-react";
import { fetchGeneralMarketNews, type NewsItem } from "@/lib/news.functions";

const STORAGE_KEY = "lumenfolio.market-ticker.v1";
const REFRESH_MS = 30 * 60 * 1000;

interface Cached {
  fetchedAt: number;
  items: NewsItem[];
}

export function NewsTicker() {
  const fetchGeneral = useServerFn(fetchGeneralMarketNews);
  const [items, setItems] = useState<NewsItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const c = JSON.parse(raw) as Cached;
      return c.items ?? [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const c = JSON.parse(raw) as Cached;
          if (Date.now() - c.fetchedAt < REFRESH_MS && c.items?.length) {
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetchGeneral({ data: {} });
        if (cancelled || !res.items?.length) return;
        setItems(res.items);
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ fetchedAt: Date.now(), items: res.items } satisfies Cached),
          );
        } catch {
          /* ignore */
        }
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchGeneral]);

  if (items.length === 0) return null;

  // Duplicate list so the marquee can loop seamlessly with translateX(-50%).
  const loop = [...items, ...items];

  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-card">
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border bg-primary/10 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <Newspaper className="h-3 w-3" />
        Markets
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex w-max animate-ticker gap-8 py-2 pl-4 whitespace-nowrap">
          {loop.map((n, i) => (
            <a
              key={`${n.id}-${i}`}
              href={n.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-foreground/90 hover:text-primary"
            >
              <span className="mr-2 font-semibold text-muted-foreground">
                {n.source}
              </span>
              {n.headline}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}