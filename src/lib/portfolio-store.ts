import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Holding,
  Transaction,
  PortfolioSnapshot,
  Settings,
  Currency,
} from "./portfolio-types";

interface PortfolioState {
  holdings: Holding[];
  transactions: Transaction[];
  history: PortfolioSnapshot[];
  settings: Settings;
  hydrated: boolean;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  deleteHolding: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  setPrices: (
    prices: Record<string, { price: number; prevClose?: number }>,
  ) => void;
  setSettings: (s: Partial<Settings>) => void;
  setFxRate: (cur: Currency, rate: number) => void;
  pushSnapshot: (s: PortfolioSnapshot) => void;
  importData: (d: {
    holdings: Holding[];
    transactions: Transaction[];
    history?: PortfolioSnapshot[];
  }) => void;
  resetAll: () => void;
}

const defaultSettings: Settings = {
  baseCurrency: "USD",
  refreshIntervalMin: 5,
  theme: "dark",
  fxRates: { USD: 1, HKD: 0.128, EUR: 1.08, GBP: 1.27, JPY: 0.0064, CNY: 0.14 },
};

const seed: Holding[] = [
  {
    id: "h1",
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    assetType: "equity",
    exchange: "NYSE",
    quantity: 50,
    avgCostBasis: 400,
    currentPrice: 512,
    prevClose: 508,
    currency: "USD",
    purchaseDate: "2024-01-15",
  },
  {
    id: "h2",
    ticker: "AAPL",
    name: "Apple Inc.",
    assetType: "equity",
    exchange: "NASDAQ",
    quantity: 30,
    avgCostBasis: 165,
    currentPrice: 212,
    prevClose: 215,
    currency: "USD",
    purchaseDate: "2023-08-10",
  },
  {
    id: "h3",
    ticker: "0700.HK",
    name: "Tencent Holdings",
    assetType: "equity",
    exchange: "HKEX",
    quantity: 100,
    avgCostBasis: 350,
    currentPrice: 405,
    prevClose: 398,
    currency: "HKD",
    purchaseDate: "2024-02-20",
  },
  {
    id: "h4",
    ticker: "BTC",
    name: "Bitcoin",
    assetType: "crypto",
    quantity: 0.5,
    avgCostBasis: 45000,
    currentPrice: 67500,
    prevClose: 66200,
    currency: "USD",
    purchaseDate: "2024-03-10",
    coingeckoId: "bitcoin",
  },
  {
    id: "h5",
    ticker: "ETH",
    name: "Ethereum",
    assetType: "crypto",
    quantity: 4,
    avgCostBasis: 2200,
    currentPrice: 3450,
    prevClose: 3400,
    currency: "USD",
    purchaseDate: "2024-04-02",
    coingeckoId: "ethereum",
  },
];

const seedTx: Transaction[] = seed.map((h) => ({
  id: "tx-" + h.id,
  type: "buy" as const,
  ticker: h.ticker,
  quantity: h.quantity,
  price: h.avgCostBasis,
  date: h.purchaseDate,
  fees: 0,
  currency: h.currency,
}));

function genHistory(currentValue: number): PortfolioSnapshot[] {
  const days = 180;
  const out: PortfolioSnapshot[] = [];
  let v = currentValue * 0.78;
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const drift = 0.0015;
    const noise = (Math.random() - 0.48) * 0.02;
    v = v * (1 + drift + noise);
    out.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      value: Math.round(v * 100) / 100,
    });
  }
  out[out.length - 1] = { ...out[out.length - 1], value: currentValue };
  return out;
}

const seedValue = seed.reduce(
  (acc, h) =>
    acc +
    h.quantity * h.currentPrice * (defaultSettings.fxRates[h.currency] ?? 1),
  0,
);

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set, get) => ({
      holdings: seed,
      transactions: seedTx,
      history: genHistory(seedValue),
      settings: defaultSettings,
      hydrated: false,
      addHolding: (h) =>
        set((s) => ({
          holdings: [...s.holdings, { ...h, id: crypto.randomUUID() }],
          transactions: [
            ...s.transactions,
            {
              id: crypto.randomUUID(),
              type: "buy",
              ticker: h.ticker,
              quantity: h.quantity,
              price: h.avgCostBasis,
              date: h.purchaseDate,
              fees: 0,
              currency: h.currency,
            },
          ],
        })),
      updateHolding: (id, patch) =>
        set((s) => ({
          holdings: s.holdings.map((h) =>
            h.id === id ? { ...h, ...patch } : h,
          ),
        })),
      deleteHolding: (id) =>
        set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),
      addTransaction: (t) => {
        const tx: Transaction = { ...t, id: crypto.randomUUID() };
        set((s) => ({ transactions: [tx, ...s.transactions] }));
        // adjust holdings if sell/buy
        const st = get();
        const h = st.holdings.find(
          (x) => x.ticker.toUpperCase() === t.ticker.toUpperCase(),
        );
        if (h) {
          if (t.type === "buy") {
            const newQty = h.quantity + t.quantity;
            const newAvg =
              (h.quantity * h.avgCostBasis + t.quantity * t.price) / newQty;
            st.updateHolding(h.id, { quantity: newQty, avgCostBasis: newAvg });
          } else {
            const newQty = Math.max(0, h.quantity - t.quantity);
            const realized = (t.price - h.avgCostBasis) * t.quantity;
            tx.realizedPnl = realized;
            st.updateHolding(h.id, { quantity: newQty });
          }
        }
      },
      setPrices: (prices) =>
        set((s) => ({
          holdings: s.holdings.map((h) => {
            const k = h.coingeckoId ?? h.ticker.toUpperCase();
            const p = prices[k];
            if (!p) return h;
            return {
              ...h,
              currentPrice: p.price,
              prevClose: p.prevClose ?? h.prevClose,
              lastUpdated: new Date().toISOString(),
            };
          }),
        })),
      setSettings: (s) =>
        set((st) => ({ settings: { ...st.settings, ...s } })),
      setFxRate: (cur, rate) =>
        set((st) => ({
          settings: {
            ...st.settings,
            fxRates: { ...st.settings.fxRates, [cur]: rate },
          },
        })),
      pushSnapshot: (snap) =>
        set((st) => {
          const last = st.history[st.history.length - 1];
          if (last && last.date === snap.date) {
            return {
              history: [...st.history.slice(0, -1), snap],
            };
          }
          return { history: [...st.history, snap] };
        }),
      importData: (d) =>
        set(() => ({
          holdings: d.holdings,
          transactions: d.transactions,
          history: d.history ?? [],
        })),
      resetAll: () =>
        set(() => ({
          holdings: seed,
          transactions: seedTx,
          history: genHistory(seedValue),
          settings: defaultSettings,
        })),
    }),
    {
      name: "portfolio-store",
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);