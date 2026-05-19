import Papa from "papaparse";
import type { Holding, AssetType, Currency } from "./portfolio-types";

const HEADER_HINTS = [
  "ticker",
  "symbol",
  "quantity",
  "qty",
  "shares",
  "costbasis",
  "avg_cost_basis",
];

function normKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-]+/g, "");
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/[, ]/g, ""));
}

function parseCsv(text: string): Record<string, unknown>[] {
  // Skip any preamble rows until we find a row containing recognizable headers.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const norm = lines[i].toLowerCase().replace(/[\s_\-"]+/g, "");
    if (HEADER_HINTS.some((k) => norm.includes(k))) {
      headerIdx = i;
      break;
    }
  }
  const trimmed = lines.slice(headerIdx).join("\n");
  const result = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (h) => normKey(h),
  });
  return result.data.filter((r) => r && Object.keys(r).length > 0);
}

const CRYPTO_TICKERS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  BNB: "binancecoin",
  LTC: "litecoin",
};

export interface CsvImportResult {
  holdings: Holding[];
  skipped: { row: number; reason: string }[];
  fxRates: Partial<Record<Currency, number>>;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface CsvValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export function validateCsvText(text: string): CsvValidationResult {
  const rows = parseCsv(text);
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const seenTickers = new Map<string, number[]>();

  rows.forEach((r, index) => {
    const rowNum = index + 2;
    const tickerRaw = r.ticker ?? r.symbol;
    const ticker = tickerRaw ? String(tickerRaw).trim() : "";
    if (!ticker) {
      errors.push({ row: rowNum, field: "ticker", message: "Ticker is required" });
    }

    const qtyRaw = r.quantity ?? r.qty ?? r.shares;
    const qty = num(qtyRaw);
    if (!isFinite(qty)) {
      errors.push({ row: rowNum, field: "quantity", message: "Valid quantity required" });
    } else if (qty <= 0) {
      errors.push({ row: rowNum, field: "quantity", message: "Quantity must be positive" });
    }

    const costRaw =
      r.costbasis ?? r.avgcostbasis ?? r.avgcost ?? r.avgprice ?? r.cost;
    if (costRaw !== undefined && costRaw !== null && costRaw !== "") {
      const cost = num(costRaw);
      if (!isFinite(cost)) {
        errors.push({ row: rowNum, field: "avgCostBasis", message: "Valid cost basis required" });
      } else if (cost < 0) {
        errors.push({ row: rowNum, field: "avgCostBasis", message: "Cost basis cannot be negative" });
      }
    }

    const typeHint = r.type ? String(r.type).toLowerCase() : "";
    if (typeHint && !["equity", "crypto", "stock", "etf"].includes(typeHint)) {
      errors.push({
        row: rowNum,
        field: "type",
        message: 'Asset type must be "equity" or "crypto"',
      });
    }

    const dateRaw = r.purchasedate ?? r.date;
    if (dateRaw && !/^\d{4}-\d{2}-\d{2}/.test(String(dateRaw))) {
      errors.push({
        row: rowNum,
        field: "purchaseDate",
        message: "Date must be YYYY-MM-DD format",
      });
    }

    if (ticker) {
      const currency = String(r.currency ?? "USD").trim().toUpperCase();
      const key = `${ticker.toUpperCase()}|${currency}`;
      if (!seenTickers.has(key)) seenTickers.set(key, []);
      seenTickers.get(key)!.push(rowNum);
    }
  });

  seenTickers.forEach((rowNums, key) => {
    if (rowNums.length > 1) {
      warnings.push(
        `Duplicate ${key} on rows ${rowNums.join(", ")} — will be merged.`,
      );
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function holdingsFromCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const holdings: Holding[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const fxAccum: Partial<Record<Currency, { sum: number; n: number }>> = {};

  rows.forEach((r, idx) => {
    const tickerRaw = r.ticker ?? r.symbol ?? "";
    const ticker = String(tickerRaw).trim().toUpperCase();
    if (!ticker) {
      skipped.push({ row: idx + 2, reason: "missing ticker" });
      return;
    }
    const quantity = num(r.quantity ?? r.qty ?? r.shares);
    const avg = num(
      r.costbasis ??
        r.avgcostbasis ??
        r.avgcost ??
        r.avgprice ??
        r.cost,
    );
    const last = num(
      r.currentprice ?? r.lastprice ?? r.price ?? r.marketprice,
    );
    if (!isFinite(quantity) || quantity <= 0) {
      skipped.push({ row: idx + 2, reason: "invalid quantity" });
      return;
    }
    const currencyRaw = String(r.currency ?? "USD")
      .trim()
      .toUpperCase();
    const currency = (
      ["USD", "HKD", "EUR", "GBP", "JPY", "CNY"].includes(currencyRaw)
        ? currencyRaw
        : "USD"
    ) as Currency;

    // Infer FX rate from market value (USD) when present and currency != USD.
    const mvUsd = num(r.marketvalueusd ?? r.marketvalue ?? r.value);
    if (
      currency !== "USD" &&
      isFinite(mvUsd) &&
      mvUsd > 0 &&
      isFinite(last) &&
      last > 0
    ) {
      const localValue = quantity * last;
      if (localValue > 0) {
        const rate = mvUsd / localValue;
        const acc = fxAccum[currency] ?? { sum: 0, n: 0 };
        acc.sum += rate;
        acc.n += 1;
        fxAccum[currency] = acc;
      }
    }

    const typeHint = String(r.type ?? "").toLowerCase();
    const cgId = CRYPTO_TICKERS[ticker];
    const isCrypto = typeHint === "crypto" || !!cgId;
    const exchange = ticker.includes(".HK")
      ? "HKEX"
      : isCrypto
        ? undefined
        : String(r.broker ?? r.brokerage ?? r.exchange ?? "").trim() ||
          undefined;

    holdings.push({
      id: crypto.randomUUID(),
      ticker,
      name: String(r.name ?? ticker).trim(),
      assetType: (isCrypto ? "crypto" : "equity") as AssetType,
      exchange,
      quantity,
      avgCostBasis: isFinite(avg) ? avg : 0,
      currentPrice: isFinite(last) ? last : isFinite(avg) ? avg : 0,
      currency,
      purchaseDate: new Date().toISOString().slice(0, 10),
      coingeckoId: cgId,
    });
  });

  const fxRates: Partial<Record<Currency, number>> = { USD: 1 };
  for (const [cur, acc] of Object.entries(fxAccum)) {
    if (acc && acc.n > 0) fxRates[cur as Currency] = acc.sum / acc.n;
  }

  return { holdings, skipped, fxRates };
}