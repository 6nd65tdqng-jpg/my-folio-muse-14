import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortfolio } from "@/lib/portfolio-store";
import type { Holding, AssetType, Currency } from "@/lib/portfolio-types";
import { toast } from "sonner";

const empty = {
  ticker: "",
  name: "",
  assetType: "equity" as AssetType,
  exchange: "NASDAQ",
  quantity: "",
  avgCostBasis: "",
  currentPrice: "",
  currency: "USD" as Currency,
  purchaseDate: new Date().toISOString().slice(0, 10),
  coingeckoId: "",
};

export function AddHoldingDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Holding | null;
}) {
  const addHolding = usePortfolio((s) => s.addHolding);
  const updateHolding = usePortfolio((s) => s.updateHolding);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (editing) {
      setForm({
        ticker: editing.ticker,
        name: editing.name,
        assetType: editing.assetType,
        exchange: editing.exchange ?? "",
        quantity: String(editing.quantity),
        avgCostBasis: String(editing.avgCostBasis),
        currentPrice: String(editing.currentPrice),
        currency: editing.currency,
        purchaseDate: editing.purchaseDate,
        coingeckoId: editing.coingeckoId ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [editing, open]);

  function submit() {
    const qty = parseFloat(form.quantity);
    const avg = parseFloat(form.avgCostBasis);
    const price = parseFloat(form.currentPrice);
    if (!form.ticker.trim() || !form.name.trim()) {
      toast.error("Ticker and name are required");
      return;
    }
    if (!isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be positive");
      return;
    }
    if (!isFinite(avg) || avg < 0 || !isFinite(price) || price < 0) {
      toast.error("Prices must be valid numbers");
      return;
    }
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim(),
      assetType: form.assetType,
      exchange: form.exchange.trim() || undefined,
      quantity: qty,
      avgCostBasis: avg,
      currentPrice: price,
      currency: form.currency,
      purchaseDate: form.purchaseDate,
      coingeckoId:
        form.assetType === "crypto"
          ? form.coingeckoId.trim().toLowerCase() || undefined
          : undefined,
    };
    if (editing) {
      updateHolding(editing.id, payload);
      toast.success(`Updated ${payload.ticker}`);
    } else {
      addHolding(payload);
      toast.success(`Added ${payload.ticker}`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit position" : "Add position"}
          </DialogTitle>
          <DialogDescription>
            Manual entry. Crypto prices auto-refresh when a CoinGecko ID is set.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker">
            <Input
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              placeholder="AAPL"
              maxLength={20}
            />
          </Field>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Apple Inc."
              maxLength={80}
            />
          </Field>
          <Field label="Asset Type">
            <Select
              value={form.assetType}
              onValueChange={(v: AssetType) =>
                setForm({ ...form, assetType: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equity">Equity</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Select
              value={form.currency}
              onValueChange={(v: Currency) =>
                setForm({ ...form, currency: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["USD", "HKD", "EUR", "GBP", "JPY", "CNY"] as Currency[]).map(
                  (c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          {form.assetType === "equity" ? (
            <Field label="Exchange">
              <Input
                value={form.exchange}
                onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                placeholder="NASDAQ / HKEX"
                maxLength={20}
              />
            </Field>
          ) : (
            <Field label="CoinGecko ID">
              <Input
                value={form.coingeckoId}
                onChange={(e) =>
                  setForm({ ...form, coingeckoId: e.target.value })
                }
                placeholder="bitcoin"
                maxLength={40}
              />
            </Field>
          )}
          <Field label="Purchase Date">
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) =>
                setForm({ ...form, purchaseDate: e.target.value })
              }
            />
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </Field>
          <Field label="Avg Cost (per unit)">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={form.avgCostBasis}
              onChange={(e) =>
                setForm({ ...form, avgCostBasis: e.target.value })
              }
            />
          </Field>
          <Field label="Current Price">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={form.currentPrice}
              onChange={(e) =>
                setForm({ ...form, currentPrice: e.target.value })
              }
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            {editing ? "Save changes" : "Add position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}