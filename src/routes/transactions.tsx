import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { fmtMoney, fmtNum } from "@/lib/portfolio-calc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddTransactionDialog } from "@/components/add-transaction-dialog";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Lumen Folio" },
      { name: "description", content: "History of all buys and sells." },
    ],
  }),
  component: TransactionsPage,
});

type SortKey = "date" | "ticker" | "type" | "qty" | "price" | "value";

function TransactionsPage() {
  const transactions = usePortfolio((s) => s.transactions);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const rows = useMemo(() => {
    const filtered = transactions.filter((t) =>
      !q ? true : t.ticker.toLowerCase().includes(q.toLowerCase()),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "date":
          return (a.date.localeCompare(b.date)) * dir;
        case "ticker":
          return a.ticker.localeCompare(b.ticker) * dir;
        case "type":
          return a.type.localeCompare(b.type) * dir;
        case "qty":
          return (a.quantity - b.quantity) * dir;
        case "price":
          return (a.price - b.price) * dir;
        case "value":
          return (a.quantity * a.price - b.quantity * b.price) * dir;
      }
    });
  }, [transactions, q, sort]);

  function toggle(k: SortKey) {
    setSort((s) =>
      s.key === k
        ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: "desc" },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {transactions.length} record{transactions.length === 1 ? "" : "s"}.
          </p>
        </div>
        <AddTransactionDialog />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium">History</CardTitle>
          <Input
            placeholder="Filter by ticker…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th onClick={() => toggle("date")}>Date</Th>
                  <Th onClick={() => toggle("type")}>Type</Th>
                  <Th onClick={() => toggle("ticker")}>Symbol</Th>
                  <Th align="right" className="hidden sm:table-cell" onClick={() => toggle("qty")}>Qty</Th>
                  <Th align="right" className="hidden md:table-cell" onClick={() => toggle("price")}>Price</Th>
                  <Th align="right" onClick={() => toggle("value")}>Value</Th>
                  <Th align="right" className="hidden md:table-cell">Realized P&L</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.date}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "uppercase",
                          t.type === "buy"
                            ? "border-[var(--success)]/40 text-[var(--success)]"
                            : "border-destructive/40 text-destructive",
                        )}
                      >
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.ticker}</TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {fmtNum(t.quantity, 4)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                      {fmtMoney(t.price, t.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtMoney(t.quantity * t.price, t.currency)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-right font-mono tabular-nums md:table-cell",
                        t.realizedPnl == null
                          ? "text-muted-foreground"
                          : t.realizedPnl >= 0
                            ? "text-[var(--success)]"
                            : "text-destructive",
                      )}
                    >
                      {t.realizedPnl == null ? "—" : fmtMoney(t.realizedPnl, t.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Th({
  children,
  align = "left",
  onClick,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      {onClick ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2", align === "right" && "ml-auto")}
          onClick={onClick}
        >
          {children} <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ) : (
        children
      )}
    </TableHead>
  );
}
