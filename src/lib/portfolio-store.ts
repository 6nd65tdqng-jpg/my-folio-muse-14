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

const PORTFOLIO_SEED_VERSION = 3;

interface PortfolioState {
  seedVersion: number;
  holdings: Holding[];
  watchlist: Holding[];
  transactions: Transaction[];
  history: PortfolioSnapshot[];
  settings: Settings;
  hydrated: boolean;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  deleteHolding: (id: string) => void;
  addWatch: (w: Omit<Holding, "id" | "quantity" | "avgCostBasis" | "purchaseDate">) => void;
  removeWatch: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;
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
    watchlist?: Holding[];
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

function holdingKey(ticker: string, currency: Currency) {
  return `${ticker.trim().toUpperCase()}|${currency}`;
}

function applyTransactionToHoldings(holdings: Holding[], tx: Transaction) {
  const ticker = tx.ticker.trim().toUpperCase();
  const key = holdingKey(ticker, tx.currency);
  const idx = holdings.findIndex((h) => holdingKey(h.ticker, h.currency) === key);
  const transaction: Transaction = { ...tx, ticker };

  if (transaction.type === "buy") {
    if (idx === -1) {
      const holding: Holding = {
        id: crypto.randomUUID(),
        ticker,
        name: ticker,
        assetType: "equity",
        quantity: transaction.quantity,
        avgCostBasis: Math.max(0, transaction.price),
        currentPrice: Math.max(0, transaction.price),
        currency: transaction.currency,
        purchaseDate: transaction.date,
      };
      return { holdings: [...holdings, holding], transaction };
    }

    const prev = holdings[idx];
    const newQty = prev.quantity + transaction.quantity;
    const newAvg =
      newQty > 0
        ? (prev.quantity * prev.avgCostBasis + transaction.quantity * transaction.price) /
          newQty
        : transaction.price;
    const next = [...holdings];
    next[idx] = {
      ...prev,
      quantity: newQty,
      avgCostBasis: Math.max(0, newAvg),
      currentPrice: prev.currentPrice > 0 ? prev.currentPrice : transaction.price,
    };
    return { holdings: next, transaction };
  }

  if (idx === -1) return { holdings, transaction };
  const prev = holdings[idx];
  const sellQty = Math.min(transaction.quantity, prev.quantity);
  const next = [...holdings];
  transaction.realizedPnl = (transaction.price - prev.avgCostBasis) * sellQty;
  next[idx] = { ...prev, quantity: Math.max(0, prev.quantity - sellQty) };
  return { holdings: next, transaction };
}

function reverseTransactionFromHoldings(holdings: Holding[], tx: Transaction) {
  const key = holdingKey(tx.ticker, tx.currency);
  const idx = holdings.findIndex((h) => holdingKey(h.ticker, h.currency) === key);
  if (idx === -1) return holdings;
  const prev = holdings[idx];
  const next = [...holdings];
  if (tx.type === "buy") {
    const newQty = Math.max(0, prev.quantity - tx.quantity);
    const newAvg =
      newQty > 0
        ? Math.max(
            0,
            (prev.quantity * prev.avgCostBasis - tx.quantity * tx.price) / newQty,
          )
        : 0;
    next[idx] = { ...prev, quantity: newQty, avgCostBasis: newAvg };
  } else {
    next[idx] = { ...prev, quantity: prev.quantity + tx.quantity };
  }
  return next;
}

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set, get) => ({
      holdings: seed,
      watchlist: [],
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
          const key = holdingKey(h.ticker, h.currency);
          const existingIdx = s.holdings.findIndex(
            (x) => holdingKey(x.ticker, x.currency) === key,
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
      addWatch: (w) =>
        set((s) => {
          const key = `${w.ticker.toUpperCase()}|${w.currency}`;
          if (
            s.watchlist.some(
              (x) => `${x.ticker.toUpperCase()}|${x.currency}` === key,
            )
          )
            return s;
          const entry: Holding = {
            ...w,
            id: crypto.randomUUID(),
            ticker: w.ticker.toUpperCase(),
            quantity: 0,
            avgCostBasis: 0,
            purchaseDate: new Date().toISOString().slice(0, 10),
          };
          return { watchlist: [...s.watchlist, entry] };
        }),
      removeWatch: (id) =>
        set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),
      addTransaction: (t) => {
        if (t.quantity <= 0) return;
        set((s) => {
          const tx: Transaction = {
            ...t,
            id: crypto.randomUUID(),
            ticker: t.ticker.trim().toUpperCase(),
          };
          const applied = applyTransactionToHoldings(s.holdings, tx);
          return {
            holdings: applied.holdings,
            transactions: [applied.transaction, ...s.transactions],
          };
        });
      },
      updateTransaction: (id, patch) =>
        set((s) => {
          const tx = s.transactions.find((t) => t.id === id);
          if (!tx) return s;
          const reversed = reverseTransactionFromHoldings(s.holdings, tx);
          const merged: Transaction = {
            ...tx,
            ...patch,
            id: tx.id,
            ticker: (patch.ticker ?? tx.ticker).toUpperCase(),
          };
          if (merged.quantity <= 0) return s;
          const applied = applyTransactionToHoldings(reversed, merged);
          return {
            holdings: applied.holdings,
            transactions: s.transactions.map((t) =>
              t.id === id ? applied.transaction : t,
            ),
          };
        }),
      deleteTransaction: (id) =>
        set((s) => {
          const tx = s.transactions.find((t) => t.id === id);
          if (!tx) return s;
          return {
            transactions: s.transactions.filter((t) => t.id !== id),
            holdings: reverseTransactionFromHoldings(s.holdings, tx),
          };
        }),
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
          watchlist: s.watchlist.map((h) => {
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
          watchlist: d.watchlist ?? [],
          seedVersion: PORTFOLIO_SEED_VERSION,
        })),
      resetAll: () =>
        set(() => ({
          holdings: seed,
          watchlist: [],
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
        holdings: (persistedState as Partial<PortfolioState>)?.holdings ?? seed,
        watchlist: (persistedState as Partial<PortfolioState>)?.watchlist ?? [],
        transactions:
          (persistedState as Partial<PortfolioState>)?.transactions ?? seedTx,
        history:
          (persistedState as Partial<PortfolioState>)?.history ?? genHistory(seedValue),
        settings: {
          ...defaultSettings,
          ...((persistedState as Partial<PortfolioState>)?.settings ?? {}),
        },
        seedVersion: PORTFOLIO_SEED_VERSION,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);