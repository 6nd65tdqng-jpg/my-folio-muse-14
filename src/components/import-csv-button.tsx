import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { holdingsFromCsv } from "@/lib/csv-import";
import { usePortfolio } from "@/lib/portfolio-store";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import type { Currency } from "@/lib/portfolio-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Holding } from "@/lib/portfolio-types";

export function ImportCsvButton({
  variant = "outline",
  size = "sm",
}: {
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default";
}) {
  const importData = usePortfolio((s) => s.importData);
  const transactions = usePortfolio((s) => s.transactions);
  const history = usePortfolio((s) => s.history);
  const settings = usePortfolio((s) => s.settings);
  const setFxRate = usePortfolio((s) => s.setFxRate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    holdings: Holding[];
    skipped: { row: number; reason: string }[];
    fxRates: Partial<Record<Currency, number>>;
  } | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const existingHoldings = usePortfolio((s) => s.holdings);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let csv: string;
        if (isExcel) {
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(reader.result as ArrayBuffer);
          const sheet =
            wb.worksheets.find((w) =>
              w.name.toLowerCase().includes("holding"),
            ) ?? wb.worksheets[0];
          const rows: string[] = [];
          sheet.eachRow({ includeEmpty: false }, (row) => {
            const vals = (row.values as unknown[]).slice(1).map((v) => {
              if (v == null) return "";
              const s =
                typeof v === "object" && v !== null && "text" in (v as object)
                  ? String((v as { text: unknown }).text ?? "")
                  : typeof v === "object" && v !== null && "result" in (v as object)
                    ? String((v as { result: unknown }).result ?? "")
                    : String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            });
            rows.push(vals.join(","));
          });
          csv = rows.join("\n");
        } else {
          csv = reader.result as string;
        }
        const result = holdingsFromCsv(csv);
        if (result.holdings.length === 0) {
          toast.error("No valid rows found in file");
          return;
        }
        setPending(result);
      } catch (err) {
        toast.error("Parse failed: " + (err as Error).message);
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  }

  function confirm() {
    if (!pending) return;
    const next =
      mode === "replace"
        ? pending.holdings
        : [...existingHoldings, ...pending.holdings];
    importData({ holdings: next, transactions, history });
    // Apply inferred FX rates so totals match the source file.
    let fxApplied = 0;
    for (const [cur, rate] of Object.entries(pending.fxRates)) {
      if (rate && rate > 0) {
        setFxRate(cur as Currency, rate);
        fxApplied++;
      }
    }
    toast.success(
      `Imported ${pending.holdings.length} position${
        pending.holdings.length === 1 ? "" : "s"
      }${pending.skipped.length ? ` · ${pending.skipped.length} skipped` : ""}${
        fxApplied > 0 ? ` · FX rates updated` : ""
      }`,
    );
    void settings;
    setPending(null);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" /> Import CSV / XLSX
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={onFile}
      />
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Import {pending?.holdings.length ?? 0} positions?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Choose how to apply these holdings to your portfolio.
                  {pending && pending.skipped.length > 0 && (
                    <span className="mt-1 block text-destructive">
                      {pending.skipped.length} row
                      {pending.skipped.length === 1 ? "" : "s"} skipped (missing
                      ticker or quantity).
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("replace")}
                    className={`rounded-md border p-3 text-left transition ${
                      mode === "replace"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium text-foreground">Replace</div>
                    <div className="text-xs text-muted-foreground">
                      Clear existing holdings and use the CSV.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("merge")}
                    className={`rounded-md border p-3 text-left transition ${
                      mode === "merge"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium text-foreground">Append</div>
                    <div className="text-xs text-muted-foreground">
                      Add CSV rows to your existing holdings.
                    </div>
                  </button>
                </div>
                {pending && pending.holdings.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-secondary text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-left">Ticker</th>
                          <th className="px-2 py-1 text-right">Qty</th>
                          <th className="px-2 py-1 text-right">Avg</th>
                          <th className="px-2 py-1 text-right">Price</th>
                          <th className="px-2 py-1 text-left">Cur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.holdings.slice(0, 50).map((h) => (
                          <tr key={h.id} className="border-t border-border">
                            <td className="px-2 py-1 font-medium">
                              {h.ticker}
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">
                              {h.quantity}
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">
                              {h.avgCostBasis}
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">
                              {h.currentPrice}
                            </td>
                            <td className="px-2 py-1">{h.currency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {mode === "replace" ? "Replace" : "Append"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}