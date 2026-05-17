import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Holding,
  Transaction,
  PortfolioSnapshot,
  Settings,
  Currency,
} from "./portfolio-types";
import {
  SEED_HOLDINGS,
  SEED_TRANSACTIONS,
  genSeedHistory,
} from "./portfolio-seed";

const PORTFOLIO_SEED_VERSION = 2;

interface PortfolioState {
  seedVersion: number;
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

const seed: Holding[] = SEED_HOLDINGS;
const seedTx: Transaction[] = SEED_TRANSACTIONS;
const genHistory = genSeedHistory;

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
      seedVersion: PORTFOLIO_SEED_VERSION,
      hydrated: false,
      addHolding: (h) =>
        set((s) => {
          // Merge into existing position with same ticker + currency using a
          // weighted-average cost basis. This prevents duplicate rows and
          // keeps avg cost mathematically correct when a user re-adds a
          // ticker they already hold.
          const key = `${h.ticker.toUpperCase()}|${h.currency}`;
          const existingIdx = s.holdings.findIndex(
            (x) => `${x.ticker.toUpperCase()}|${x.currency}` === key,
          );
          const buyTx = {
            id: crypto.randomUUID(),
            type: "buy" as const,
            ticker: h.ticker.toUpperCase(),
            quantity: h.quantity,
            price: h.avgCostBasis,
            date: h.purchaseDate,
            fees: 0,
            currency: h.currency,
          };
          if (existingIdx === -1) {
            return {
              holdings: [...s.holdings, { ...h, id: crypto.randomUUID() }],
              transactions: [...s.transactions, buyTx],
            };
          }
          const prev = s.holdings[existingIdx];
          const newQty = prev.quantity + h.quantity;
          const newAvg =
            newQty > 0
              ? (prev.quantity * prev.avgCostBasis +
                  h.quantity * h.avgCostBasis) /
                newQty
              : prev.avgCostBasis;
          const next = [...s.holdings];
          next[existingIdx] = {
            ...prev,
            quantity: newQty,
            avgCostBasis: newAvg,
            currentPrice: h.currentPrice || prev.currentPrice,
          };
          return {
            holdings: next,
            transactions: [...s.transactions, buyTx],
          };
        }),
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
        const st = get();
        const h = st.holdings.find(
          (x) => x.ticker.toUpperCase() === t.ticker.toUpperCase(),
        );
        if (!h) return;
        if (t.quantity <= 0) return;
        if (t.type === "buy") {
          // Weighted-average cost basis. Guard newQty > 0 (always true here
          // since both terms are positive) and never let avg go negative.
          const newQty = h.quantity + t.quantity;
          const newAvg =
            newQty > 0
              ? (h.quantity * h.avgCostBasis + t.quantity * t.price) / newQty
              : t.price;
          st.updateHolding(h.id, {
            quantity: newQty,
            avgCostBasis: Math.max(0, newAvg),
          });
        } else {
          // Sell: avg cost basis is preserved on remaining shares (it only
          // changes on buys). Cap sell quantity at current holding to avoid
          // negative positions, and record realized P&L on the shares sold.
          const sellQty = Math.min(t.quantity, h.quantity);
          const newQty = h.quantity - sellQty;
          tx.realizedPnl = (t.price - h.avgCostBasis) * sellQty;
          st.updateHolding(h.id, { quantity: newQty });
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
          seedVersion: PORTFOLIO_SEED_VERSION,
        })),
      resetAll: () =>
        set(() => ({
          holdings: seed,
          transactions: seedTx,
          history: genHistory(seedValue),
          settings: defaultSettings,
          seedVersion: PORTFOLIO_SEED_VERSION,
        })),
    }),
    {
      name: "portfolio-store",
      version: PORTFOLIO_SEED_VERSION,
      migrate: (persistedState) => ({
        ...(persistedState as Partial<PortfolioState>),
        holdings: seed,
        transactions: seedTx,
        history: genHistory(seedValue),
        settings: defaultSettings,
        seedVersion: PORTFOLIO_SEED_VERSION,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);