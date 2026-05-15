export type AssetType = "equity" | "crypto";
export type Currency = "USD" | "HKD" | "EUR" | "GBP" | "JPY" | "CNY";

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  exchange?: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  prevClose?: number;
  currency: Currency;
  purchaseDate: string;
  coingeckoId?: string;
  lastUpdated?: string;
}

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  ticker: string;
  quantity: number;
  price: number;
  date: string;
  fees: number;
  realizedPnl?: number;
  currency: Currency;
}

export interface PortfolioSnapshot {
  date: string;
  value: number;
}

export interface Settings {
  baseCurrency: Currency;
  refreshIntervalMin: number;
  theme: "light" | "dark";
  fxRates: Partial<Record<Currency, number>>; // rate to USD
}