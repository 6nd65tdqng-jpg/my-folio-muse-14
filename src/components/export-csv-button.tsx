import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { toast } from "sonner";
import Papa from "papaparse";

export function ExportCsvButton({
  variant = "outline",
  size = "sm",
}: {
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default";
}) {
  const holdings = usePortfolio((s) => s.holdings);

  function onExport() {
    if (holdings.length === 0) {
      toast.error("No holdings to export");
      return;
    }
    const rows = holdings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      type: h.assetType,
      exchange: h.exchange ?? "",
      quantity: h.quantity,
      avg_cost_basis: h.avgCostBasis,
      current_price: h.currentPrice,
      currency: h.currency,
      market_value: h.quantity * h.currentPrice,
      purchase_date: h.purchaseDate,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `holdings-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${holdings.length} position${holdings.length === 1 ? "" : "s"}`);
  }

  return (
    <Button variant={variant} size={size} onClick={onExport}>
      <Download className="mr-2 h-4 w-4" /> Export CSV
    </Button>
  );
}