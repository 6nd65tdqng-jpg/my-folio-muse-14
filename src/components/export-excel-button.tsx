import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { exportToExcel } from "@/lib/excel-export";
import { toast } from "sonner";

export function ExportExcelButton() {
  const [exporting, setExporting] = useState(false);
  const holdings = usePortfolio((s) => s.holdings);
  const transactions = usePortfolio((s) => s.transactions);
  const history = usePortfolio((s) => s.history);
  const settings = usePortfolio((s) => s.settings);

  async function handleExport() {
    setExporting(true);
    try {
      await exportToExcel({ holdings, transactions, history, settings });
      toast.success("Portfolio exported to Excel");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export portfolio");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      onClick={handleExport}
      disabled={exporting || holdings.length === 0}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      Excel
    </Button>
  );
}