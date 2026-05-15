import type { Holding, AssetType, Currency } from "./portfolio-types";

const HEADER_KEYS = ["ticker", "quantity", "avg_cost_basis"];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  // Skip preamble rows until we find a row containing the expected header keys.
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map((c) =>
      c.toLowerCase().replace(/\s+/g, "_"),
    );
    if (HEADER_KEYS.every((k) => cells.includes(k))) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitLine(lines[headerIdx]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );
  return lines.slice(headerIdx + 1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function num(v: string | undefined): number {
  if (!v) return NaN;
  return parseFloat(v.replace(/[, ]/g, ""));
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

export function holdingsFromCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const holdings: Holding[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const fxAccum: Partial<Record<Currency, { sum: number; n: number }>> = {};

  rows.forEach((r, idx) => {
    const ticker = (r.ticker || r.symbol || "").trim().toUpperCase();
    if (!ticker) {
      skipped.push({ row: idx + 2, reason: "missing ticker" });
      return;
    }
    const quantity = num(r.quantity || r.qty || r.shares);
    const avg = num(
      r.avg_cost_basis || r.avg_cost || r.cost_basis || r.avg_price,
    );
    const last = num(r.last_price || r.current_price || r.price);
    if (!isFinite(quantity) || quantity <= 0) {
      skipped.push({ row: idx + 2, reason: "invalid quantity" });
      return;
    }
    const currencyRaw = (r.currency || "USD").trim().toUpperCase();
    const currency = (
      ["USD", "HKD", "EUR", "GBP", "JPY", "CNY"].includes(currencyRaw)
        ? currencyRaw
        : "USD"
    ) as Currency;

    // Infer FX rate from market_value_usd when present and currency != USD.
    const mvUsd = num(r.market_value_usd);
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

    const cgId = CRYPTO_TICKERS[ticker];
    const isCrypto = !!cgId;
    const exchange = ticker.includes(".HK")
      ? "HKEX"
      : isCrypto
        ? undefined
        : (r.brokerage || r.exchange || "").trim() || undefined;

    holdings.push({
      id: crypto.randomUUID(),
      ticker,
      name: (r.name || ticker).trim(),
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