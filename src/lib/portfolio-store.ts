import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Holding,
  Transaction,
  PortfolioSnapshot,
  Settings,
  Currency,
  PortfolioCloudData,
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
  pricesFetching: boolean;
  lastPriceUpdate: string | null;
  priceError: string | null;
  setPricesFetching: (fetching: boolean) => void;
  setPriceError: (error: string | null) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  deleteHolding: (id: string) => void;
  addWatch: (w: Omit<Holding, "id" | "quantity" | "avgCostBasis" | "purchaseDate">) => void;
  removeWatch: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;
  setPrices: (
    prices: Record<string, { price: number; prevClose?: number; stale?: boolean }>,
    options?: { markRefreshed?: boolean },
  ) => void;
  replaceFromCloud: (data: PortfolioCloudData) => void;
  getCloudData: () => PortfolioCloudData;
  setSettings: (s: Partial<Settings>) => void;
  setFxRate: (cur: Currency, rate: number) => void;
  pushSnapshot: (s: PortfolioSnapshot) => void;
  importData: (d: {
    holdings: Holding[];
    transactions: Transaction[];
    history?: PortfolioSnapshot[];
    watchlist?: Holding[];
  }) => void;
  rebuildHoldingsFromTransactions: () => void;
  resetAll: () => void;
}

const defaultSettings: Settings = {
  baseCurrency: "USD",
  refreshIntervalMin: 5,
  theme: "dark",
  fxRates: { USD: 1, HKD: 0.1276, EUR: 1.1647, GBP: 1.34, JPY: 0.0068, CNY: 0.14 },
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

// Legacy fix: "NEA" was mis-mapped to Nodle; the real holding is NEAR Protocol.
function fixLegacyHolding<T extends { ticker: string }>(h: T): T {
  if (h.ticker.toUpperCase() !== "NEA") return h;
  const x = h as T & Partial<Holding>;
  return {
    ...h,
    ticker: "NEAR",
    ...(x.coingeckoId !== undefined || x.assetType === "crypto"
      ? { name: "NEAR Protocol", coingeckoId: "near", currentPrice: x.currentPrice && x.currentPrice > 0.01 ? x.currentPrice : 5.648, prevClose: undefined }
      : {}),
  };
}

function holdingKey(ticker: string, currency: Currency) {
  return `${ticker.trim().toUpperCase()}|${currency}`;
}

function applyTransactionToHoldings(holdings: Holding[], tx: Transaction) {
  const ticker = tx.ticker.trim().toUpperCase();
  const key = holdingKey(ticker, tx.currency);
  const idx = holdings.findIndex((h) => holdingKey(h.ticker, h.currency) === key);
  const transaction: Transaction = { ...tx, ticker, realizedPnl: undefined };

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

  if (idx === -1) return { holdings, transaction: { ...transaction, quantity: 0 } };
  const prev = holdings[idx];
  const sellQty = Math.min(transaction.quantity, prev.quantity);
  const next = [...holdings];
  transaction.quantity = sellQty;
  transaction.realizedPnl = (transaction.price - prev.avgCostBasis) * sellQty;
  next[idx] = { ...prev, quantity: Math.max(0, prev.quantity - sellQty) };
  return { holdings: next, transaction };
}

function replayTransactions(transactions: Transaction[], priorHoldings: Holding[]) {
  const priorByKey = new Map(
    priorHoldings.map((h) => [holdingKey(h.ticker, h.currency), h]),
  );
  const ordered = transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => {
      const byDate = a.tx.date.localeCompare(b.tx.date);
      return byDate !== 0 ? byDate : b.index - a.index;
    });
  const normalizedById = new Map<string, Transaction>();
  let holdings: Holding[] = [];

  for (const { tx } of ordered) {
    const applied = applyTransactionToHoldings(holdings, tx);
    holdings = applied.holdings;
    if (applied.transaction.quantity > 1e-9) {
      normalizedById.set(tx.id, applied.transaction);
    }
  }

  holdings = holdings
    .filter((h) => h.quantity > 1e-9)
    .map((h) => {
      const prior = priorByKey.get(holdingKey(h.ticker, h.currency));
      return prior
        ? {
            ...h,
            id: prior.id,
            name: prior.name || h.name,
            assetType: prior.assetType,
            exchange: prior.exchange,
            currentPrice: prior.currentPrice > 0 ? prior.currentPrice : h.currentPrice,
            prevClose: prior.prevClose,
            coingeckoId: prior.coingeckoId,
            lastUpdated: prior.lastUpdated,
          }
        : h;
    });

  return {
    holdings,
    transactions: transactions.flatMap((tx) => {
      const normalized = normalizedById.get(tx.id);
      return normalized ? [normalized] : [];
    }),
  };
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
      pricesFetching: false,
      lastPriceUpdate: null,
      priceError: null,
      setPricesFetching: (fetching) => set({ pricesFetching: fetching }),
      setPriceError: (error) => set({ priceError: error }),
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
          return replayTransactions([tx, ...s.transactions], s.holdings);
        });
      },
      updateTransaction: (id, patch) =>
        set((s) => {
          const tx = s.transactions.find((t) => t.id === id);
          if (!tx) return s;
          const merged: Transaction = {
            ...tx,
            ...patch,
            id: tx.id,
            ticker: (patch.ticker ?? tx.ticker).toUpperCase(),
          };
          if (merged.quantity <= 0) return s;
          return replayTransactions(
            s.transactions.map((item) => (item.id === id ? merged : item)),
            s.holdings,
          );
        }),
      deleteTransaction: (id) =>
        set((s) => {
          const tx = s.transactions.find((t) => t.id === id);
          if (!tx) return s;
          return replayTransactions(
            s.transactions.filter((item) => item.id !== id),
            s.holdings,
          );
        }),
      setPrices: (prices, options) =>
        set((s) => ({
          holdings: s.holdings.map((h) => {
            const k = h.coingeckoId ?? h.ticker.toUpperCase();
            const p = prices[k];
            if (!p) return h;
            return {
              ...h,
              currentPrice: p.price,
              prevClose: p.prevClose ?? h.prevClose,
              lastUpdated: p.stale ? h.lastUpdated : new Date().toISOString(),
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
              lastUpdated: p.stale ? h.lastUpdated : new Date().toISOString(),
            };
          }),
          lastPriceUpdate: options?.markRefreshed === false ? s.lastPriceUpdate : new Date().toISOString(),
          priceError: null,
        })),
      replaceFromCloud: (data) =>
        set((s) => ({
          holdings: data.holdings.filter((h) => h.quantity > 1e-9).map(fixLegacyHolding),
          watchlist: data.watchlist ?? [],
          transactions: data.transactions.map(fixLegacyHolding),
          history: data.history ?? [],
          settings: { ...defaultSettings, ...s.settings, ...(data.settings ?? {}) },
          lastPriceUpdate: data.lastPriceUpdate ?? null,
          priceError: null,
          seedVersion: data.seedVersion ?? PORTFOLIO_SEED_VERSION,
        })),
      getCloudData: () => {
        const s = get();
        return {
          seedVersion: PORTFOLIO_SEED_VERSION,
          holdings: s.holdings,
          watchlist: s.watchlist,
          transactions: s.transactions,
          history: s.history,
          settings: s.settings,
          lastPriceUpdate: s.lastPriceUpdate,
        };
      },
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
      rebuildHoldingsFromTransactions: () =>
        set((s) => replayTransactions(s.transactions, s.holdings)),
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
      partialize: (state) => ({
        seedVersion: state.seedVersion,
        holdings: state.holdings,
        watchlist: state.watchlist,
        transactions: state.transactions,
        history: state.history,
        settings: state.settings,
        lastPriceUpdate: state.lastPriceUpdate,
      }),
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
        lastPriceUpdate:
          (persistedState as Partial<PortfolioState>)?.lastPriceUpdate ?? null,
        seedVersion: PORTFOLIO_SEED_VERSION,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
          if (Array.isArray(state.holdings)) {
            state.holdings = state.holdings
              .filter((h) => h.quantity > 1e-9)
              .map(fixLegacyHolding);
          }
          if (Array.isArray(state.transactions)) {
            state.transactions = state.transactions.map(fixLegacyHolding);
          }
        }
      },
    },
  ),
);