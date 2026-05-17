import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchSymbols, type SymbolSuggestion } from "@/lib/symbol-search.functions";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPick?: (s: SymbolSuggestion) => void;
  kind?: "any" | "equity" | "crypto";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export function SymbolAutocomplete({
  value,
  onChange,
  onPick,
  kind = "any",
  placeholder = "Search ticker or name…",
  className,
  inputClassName,
  autoFocus,
}: Props) {
  const search = useServerFn(searchSymbols);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SymbolSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const r = await search({ data: { query: q, kind } });
        if (!ac.signal.aborted) {
          setResults(r.results.slice(0, 12));
          setHighlight(0);
        }
      } catch {
        // ignore
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, kind, search]);

  function pick(s: SymbolSuggestion) {
    onChange(s.symbol);
    onPick?.(s);
    setOpen(false);
  }

  return (
    <Popover open={open && (loading || results.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && results[highlight]) {
                e.preventDefault();
                pick(results[highlight]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={cn("pl-7", inputClassName)}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[--radix-popover-trigger-width] max-w-md p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {results.length === 0 && !loading && value.trim().length > 0 && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            No matches. You can still type a custom symbol.
          </div>
        )}
        <ul className="max-h-72 overflow-auto">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.symbol}-${r.coingeckoId ?? r.exchange ?? i}`}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                  i === highlight ? "bg-accent text-accent-foreground" : "",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium">{r.symbol}</span>
                    <span
                      className={cn(
                        "rounded px-1 py-px text-[9px] uppercase tracking-wider",
                        r.kind === "crypto"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                      )}
                    >
                      {r.kind === "crypto" ? "Crypto" : "Equity"}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">{r.name}</div>
                </div>
                <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                  {r.exchange && <div>{r.exchange}</div>}
                  {r.currency && <div className="font-mono">{r.currency}</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
