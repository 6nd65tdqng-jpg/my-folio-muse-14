import { describe, it, expect, beforeEach } from "vitest";
import { usePortfolio } from "./portfolio-store";
import type { Holding } from "./portfolio-types";

const baseHolding: Omit<Holding, "id"> = {
  ticker: "TEST",
  name: "Test Co",
  assetType: "equity",
  exchange: "NASDAQ",
  quantity: 10,
  avgCostBasis: 100,
  currentPrice: 100,
  currency: "USD",
  purchaseDate: "2024-01-01",
};

function resetStore() {
  usePortfolio.setState({ holdings: [], transactions: [], history: [] });
}

function get(ticker: string) {
  return usePortfolio
    .getState()
    .holdings.find((h) => h.ticker === ticker.toUpperCase());
}

describe("portfolio-store: weighted-average cost basis", () => {
  beforeEach(() => resetStore());

  describe("addHolding — repeated adds merge", () => {
    it("creates a single row when ticker doesn't exist", () => {
      usePortfolio.getState().addHolding(baseHolding);
      expect(usePortfolio.getState().holdings).toHaveLength(1);
      expect(get("TEST")?.quantity).toBe(10);
      expect(get("TEST")?.avgCostBasis).toBe(100);
    });

    it("merges same ticker + currency with weighted-average avg cost", () => {
      usePortfolio.getState().addHolding(baseHolding); // 10 @ 100
      usePortfolio.getState().addHolding({ ...baseHolding, quantity: 10, avgCostBasis: 200 });
      expect(usePortfolio.getState().holdings).toHaveLength(1);
      const h = get("TEST")!;
      expect(h.quantity).toBe(20);
      // (10*100 + 10*200) / 20 = 150
      expect(h.avgCostBasis).toBe(150);
    });

    it("handles asymmetric weights correctly", () => {
      usePortfolio.getState().addHolding({ ...baseHolding, quantity: 3, avgCostBasis: 50 });
      usePortfolio.getState().addHolding({ ...baseHolding, quantity: 7, avgCostBasis: 150 });
      const h = get("TEST")!;
      expect(h.quantity).toBe(10);
      // (3*50 + 7*150) / 10 = 120
      expect(h.avgCostBasis).toBeCloseTo(120, 10);
    });

    it("does NOT merge across different currencies", () => {
      usePortfolio.getState().addHolding(baseHolding);
      usePortfolio.getState().addHolding({ ...baseHolding, currency: "EUR" });
      expect(usePortfolio.getState().holdings).toHaveLength(2);
    });
  });

  describe("addTransaction: BUY — weighted average", () => {
    beforeEach(() => {
      resetStore();
      usePortfolio.getState().addHolding(baseHolding); // 10 @ 100
    });

    it("recomputes avg cost on additional buy", () => {
      usePortfolio.getState().addTransaction({
        type: "buy",
        ticker: "TEST",
        quantity: 10,
        price: 200,
        date: "2024-02-01",
        fees: 0,
        currency: "USD",
      });
      const h = get("TEST")!;
      expect(h.quantity).toBe(20);
      expect(h.avgCostBasis).toBe(150);
    });

    it("chained buys produce mathematically correct average", () => {
      const buy = (q: number, p: number) =>
        usePortfolio.getState().addTransaction({
          type: "buy", ticker: "TEST", quantity: q, price: p,
          date: "2024-02-01", fees: 0, currency: "USD",
        });
      buy(5, 120);   // total: 15 @ ((10*100 + 5*120)/15) = 106.666...
      buy(5, 80);    // total: 20 @ ((15*106.666... + 5*80)/20) = 100
      const h = get("TEST")!;
      expect(h.quantity).toBe(20);
      expect(h.avgCostBasis).toBeCloseTo(100, 8);
    });

    it("avg cost never goes negative", () => {
      usePortfolio.getState().addTransaction({
        type: "buy", ticker: "TEST", quantity: 5, price: 0,
        date: "2024-02-01", fees: 0, currency: "USD",
      });
      const h = get("TEST")!;
      expect(h.avgCostBasis).toBeGreaterThanOrEqual(0);
    });
  });

  describe("addTransaction: SELL — partial sells preserve avg cost", () => {
    beforeEach(() => {
      resetStore();
      usePortfolio.getState().addHolding(baseHolding); // 10 @ 100
    });

    it("partial sell reduces quantity but keeps avg cost unchanged", () => {
      usePortfolio.getState().addTransaction({
        type: "sell", ticker: "TEST", quantity: 3, price: 150,
        date: "2024-02-01", fees: 0, currency: "USD",
      });
      const h = get("TEST")!;
      expect(h.quantity).toBe(7);
      expect(h.avgCostBasis).toBe(100); // unchanged
    });

    it("records realized P&L = (sellPrice - avgCost) * sellQty", () => {
      usePortfolio.getState().addTransaction({
        type: "sell", ticker: "TEST", quantity: 3, price: 150,
        date: "2024-02-01", fees: 0, currency: "USD",
      });
      const tx = usePortfolio.getState().transactions[0];
      expect(tx.type).toBe("sell");
      expect(tx.realizedPnl).toBe((150 - 100) * 3); // 150
    });

    it("selling more than held caps at current quantity — never negative", () => {
      usePortfolio.getState().addTransaction({
        type: "sell", ticker: "TEST", quantity: 999, price: 150,
        date: "2024-02-01", fees: 0, currency: "USD",
      });
      // Position fully closed and removed.
      expect(get("TEST")).toBeUndefined();
      const tx = usePortfolio.getState().transactions[0];
      // realized P&L is on the shares actually sold (10), not on 999
      expect(tx.realizedPnl).toBe((150 - 100) * 10);
    });

    it("selling entire position leaves avg cost intact for next buy reset", () => {
      usePortfolio.getState().addTransaction({
        type: "sell", ticker: "TEST", quantity: 10, price: 150,
        date: "2024-02-01", fees: 0, currency: "USD",
      });
      // Fully-closed positions are removed from holdings.
      expect(get("TEST")).toBeUndefined();
      // Re-buying at a new price resets effective avg correctly
      usePortfolio.getState().addTransaction({
        type: "buy", ticker: "TEST", quantity: 5, price: 200,
        date: "2024-03-01", fees: 0, currency: "USD",
      });
      const h = get("TEST")!;
      expect(h.quantity).toBe(5);
      // (0*100 + 5*200)/5 = 200
      expect(h.avgCostBasis).toBe(200);
    });
  });

  describe("deleteHolding", () => {
    it("removes the holding cleanly", () => {
      usePortfolio.getState().addHolding(baseHolding);
      const id = get("TEST")!.id;
      usePortfolio.getState().deleteHolding(id);
      expect(get("TEST")).toBeUndefined();
    });

    it("does not affect other holdings", () => {
      usePortfolio.getState().addHolding(baseHolding);
      usePortfolio.getState().addHolding({ ...baseHolding, ticker: "OTHER" });
      const id = get("TEST")!.id;
      usePortfolio.getState().deleteHolding(id);
      expect(get("OTHER")?.quantity).toBe(10);
      expect(usePortfolio.getState().holdings).toHaveLength(1);
    });

    it("never produces negative quantity (delete is total removal)", () => {
      usePortfolio.getState().addHolding(baseHolding);
      const id = get("TEST")!.id;
      usePortfolio.getState().deleteHolding(id);
      for (const h of usePortfolio.getState().holdings) {
        expect(h.quantity).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("invariants across mixed operations", () => {
    it("no holding ever has negative quantity after a buy/sell/buy sequence", () => {
      usePortfolio.getState().addHolding(baseHolding); // 10 @ 100
      const ops = [
        { type: "buy" as const, quantity: 5, price: 120 },
        { type: "sell" as const, quantity: 7, price: 130 },
        { type: "sell" as const, quantity: 50, price: 90 }, // overshoots
        { type: "buy" as const, quantity: 4, price: 110 },
      ];
      for (const o of ops) {
        usePortfolio.getState().addTransaction({
          ...o, ticker: "TEST", date: "2024-02-01", fees: 0, currency: "USD",
        });
        for (const h of usePortfolio.getState().holdings) {
          expect(h.quantity).toBeGreaterThanOrEqual(0);
          expect(h.avgCostBasis).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});