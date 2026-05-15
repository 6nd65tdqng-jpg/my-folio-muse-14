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