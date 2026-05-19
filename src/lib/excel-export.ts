import ExcelJS from "exceljs";
import type {
  Holding,
  Transaction,
  PortfolioSnapshot,
  Settings,
} from "./portfolio-types";
import { portfolioMetrics, holdingMetrics } from "./portfolio-calc";

interface ExportData {
  holdings: Holding[];
  transactions: Transaction[];
  history: PortfolioSnapshot[];
  settings: Settings;
}

export async function exportToExcel(data: ExportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AM Portfolio Tracker";
  workbook.created = new Date();

  const metrics = portfolioMetrics(
    data.holdings,
    data.transactions,
    data.settings,
  );

  // Summary
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 20 },
  ];
  summary.addRows([
    { metric: "Total Portfolio Value", value: metrics.totalValue },
    { metric: "Total Cost Basis", value: metrics.totalCost },
    { metric: "Total P&L", value: metrics.totalPnl },
    { metric: "Total P&L %", value: metrics.totalPnlPct / 100 },
    { metric: "Day Change", value: metrics.dayChange },
    { metric: "Day Change %", value: metrics.dayChangePct / 100 },
    { metric: "Realized P&L", value: metrics.realized },
  ]);
  const currencyFmt =
    data.settings.baseCurrency === "USD" ? "$#,##0.00" : "#,##0.00";
  summary.getColumn("value").numFmt = currencyFmt;
  summary.getCell("B5").numFmt = "0.00%";
  summary.getCell("B7").numFmt = "0.00%";

  // Holdings
  const holdings = workbook.addWorksheet("Holdings");
  holdings.columns = [
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Name", key: "name", width: 28 },
    { header: "Asset Type", key: "assetType", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Quantity", key: "quantity", width: 14 },
    { header: "Avg Cost", key: "avgCost", width: 14 },
    { header: "Current Price", key: "currentPrice", width: 14 },
    { header: "Market Value", key: "marketValue", width: 16 },
    { header: "Total P&L", key: "totalPnl", width: 16 },
    { header: "P&L %", key: "pnlPercent", width: 12 },
  ];
  data.holdings.forEach((h) => {
    const m = holdingMetrics(h, data.settings);
    holdings.addRow({
      ticker: h.ticker,
      name: h.name,
      assetType: h.assetType,
      currency: h.currency,
      quantity: h.quantity,
      avgCost: h.avgCostBasis,
      currentPrice: h.currentPrice,
      marketValue: m.value,
      totalPnl: m.pnl,
      pnlPercent: m.pnlPct / 100,
    });
  });
  ["F", "G", "H", "I"].forEach((col) => {
    holdings.getColumn(col).numFmt = "#,##0.00";
  });
  holdings.getColumn("E").numFmt = "#,##0.0000";
  holdings.getColumn("J").numFmt = "0.00%";
  holdings.getColumn("I").eachCell((cell, rowNumber) => {
    if (rowNumber > 1 && typeof cell.value === "number") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: cell.value >= 0 ? "FF90EE90" : "FFFF6B6B" },
      };
    }
  });

  // Transactions
  const transactions = workbook.addWorksheet("Transactions");
  transactions.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Type", key: "type", width: 8 },
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Quantity", key: "quantity", width: 14 },
    { header: "Price", key: "price", width: 14 },
    { header: "Fees", key: "fees", width: 10 },
    { header: "Realized P&L", key: "realizedPnl", width: 16 },
  ];
  [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((t) => {
      transactions.addRow({
        date: t.date,
        type: t.type.toUpperCase(),
        ticker: t.ticker,
        currency: t.currency,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees ?? 0,
        realizedPnl: t.realizedPnl ?? 0,
      });
    });
  ["E", "F", "G", "H"].forEach((col) => {
    transactions.getColumn(col).numFmt = "#,##0.00";
  });

  // History
  if (data.history.length > 0) {
    const history = workbook.addWorksheet("History");
    history.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Total Value", key: "value", width: 18 },
    ];
    data.history.forEach((s) =>
      history.addRow({ date: s.date, value: s.value }),
    );
    history.getColumn("value").numFmt = currencyFmt;
  }

  // Header styling
  workbook.worksheets.forEach((sheet) => {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}