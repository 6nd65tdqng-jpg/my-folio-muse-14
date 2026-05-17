import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { toast } from "sonner";
import type { Currency } from "@/lib/portfolio-types";
import { SymbolAutocomplete } from "@/components/symbol-autocomplete";

export function AddTransactionDialog() {
  const holdings = usePortfolio((s) => s.holdings);
  const addTransaction = usePortfolio((s) => s.addTransaction);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [symbolMode, setSymbolMode] = useState<"existing" | "new">("existing");
  const [symbol, setSymbol] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"equity" | "crypto">("equity");
  const [newCurrency, setNewCurrency] = useState<Currency>("USD");
  const [newCoingeckoId, setNewCoingeckoId] = useState<string | undefined>(undefined);
  const [newExchange, setNewExchange] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");

  const tickers = useMemo(
    () =>
      [...new Set(holdings.map((h) => h.ticker.toUpperCase()))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [holdings],
  );

  function reset() {
    setType("buy");
    setSymbolMode("existing");
    setSymbol("");
    setNewSymbol("");
    setNewName("");
    setNewKind("equity");
    setNewCurrency("USD");
    setNewCoingeckoId(undefined);
    setNewExchange(undefined);
    setQuantity("");
    setPrice("");
    setDate(new Date().toISOString().slice(0, 10));
    setBroker("");
    setNotes("");
  }

  function submit() {
    const ticker = (symbolMode === "existing" ? symbol : newSymbol).trim().toUpperCase();
    const qty = Number(quantity);
    const px = Number(price);
    if (!ticker) return toast.error("Please choose or enter a symbol.");
    if (!qty || qty <= 0) return toast.error("Quantity must be greater than 0.");
    if (!isFinite(px) || px < 0) return toast.error("Price is invalid.");

    const existing = holdings.find((h) => h.ticker.toUpperCase() === ticker);

    if (type === "sell" && !existing) {
      return toast.error(`You don't hold ${ticker}.`);
    }
    if (type === "sell" && existing && qty > existing.quantity + 1e-9) {
      return toast.error(
        `Sell quantity exceeds your ${ticker} holding (${existing.quantity}).`,
      );
    }

    const currency: Currency = existing?.currency ?? (symbolMode === "new" ? newCurrency : "USD");

    if (type === "buy" && !existing) {
      // Create new holding via importData/addHolding flow
      usePortfolio.getState().addHolding({
        ticker,
        name: newName.trim() || ticker,
        assetType: newKind,
        quantity: qty,
        avgCostBasis: px,
        currentPrice: px,
        currency,
        purchaseDate: date,
        exchange: newExchange || broker || undefined,
        ...(newKind === "crypto" && newCoingeckoId ? { coingeckoId: newCoingeckoId } : {}),
      });
      toast.success(`Added new position ${ticker}.`);
    } else {
      addTransaction({
        type,
        ticker,
        quantity: qty,
        price: px,
        date,
        fees: 0,
        currency,
      });
      toast.success(
        type === "buy"
          ? `Bought ${qty} ${ticker} @ ${px}.`
          : `Sold ${qty} ${ticker} @ ${px}.`,
      );
    }

    if (notes || broker) {
      // append a meta note as a zero-qty transaction? Skip — keep simple.
    }

    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
          <DialogDescription>
            Record a buy or sell. Holdings update automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <ToggleGroup
              type="single"
              value={type}
              onValueChange={(v) => v && setType(v as "buy" | "sell")}
              className="justify-start"
            >
              <ToggleGroupItem value="buy">BUY</ToggleGroupItem>
              <ToggleGroupItem value="sell">SELL</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Symbol</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={symbolMode}
              onValueChange={(v) => v && setSymbolMode(v as "existing" | "new")}
              className="justify-start"
            >
              <ToggleGroupItem value="existing">Existing</ToggleGroupItem>
              <ToggleGroupItem value="new" disabled={type === "sell"}>
                New
              </ToggleGroupItem>
            </ToggleGroup>
            {symbolMode === "existing" ? (
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose symbol" />
                </SelectTrigger>
                <SelectContent>
                  {tickers.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <SymbolAutocomplete
                value={newSymbol}
                onChange={setNewSymbol}
                onPick={(s) => {
                  setNewSymbol(s.symbol);
                  setNewName(s.name);
                  setNewKind(s.kind);
                  if (s.currency) setNewCurrency(s.currency as Currency);
                  setNewCoingeckoId(s.coingeckoId);
                  setNewExchange(s.exchange);
                }}
                placeholder="Search ticker or name (e.g. NVDA, bitcoin)"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Broker</Label>
              <Input
                placeholder="Optional"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save transaction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}