# AM Portfolio Tracker — Feature Summary

A PWA-enabled personal portfolio tracker for equities and crypto, built on TanStack Start with Lovable Cloud (Supabase) for server functions and a Zustand-persisted local store for portfolio data.

## Core Portfolio Management
- **Holdings**: Add, edit, delete positions (equities + crypto), with weighted-average cost basis merging when re-adding the same ticker.
- **Transactions**: Buy/sell entries with quantity, price, fees, currency, date. Sells reduce quantity, preserve avg cost, compute realized P/L, and auto-remove zero-balance positions.
- **Rebuild holdings**: One-click rebuild of holdings from full transaction history (recovery tool on /holdings).
- **Watchlist**: Track tickers without owning them.
- **CSV import/export**: Bulk import transactions/holdings; export current holdings to CSV.

## Market Data & Pricing
- **Live prices** via server functions (`quotes.functions.ts`, `extended-quote.functions.ts`) with extended-hours pricing.
- **Auto-refresh** at configurable interval (default 5 min).
- **Market status** indicator and US market session awareness.
- **Market indices card** on dashboard.

## Analytics & Insights
- **Portfolio metrics**: total value, cost, unrealized P/L, day change, realized P/L — all converted to base currency via FX rates.
- **Per-holding metrics**: value, cost, P/L %, day change.
- **Historical snapshots**: max drawdown, annualized return calculations.
- **Analytics page** with stock research integration.
- **Events calendar** (earnings/dividends via `events.functions.ts`).
- **News feed** (`news.functions.ts`) and **AI assistant chat** (Lovable AI Gateway).

## Multi-Currency
- USD, HKD, EUR, GBP, JPY, CNY with configurable FX rates; everything normalized to a chosen base currency.

## Pages / Routes
- `/` Dashboard, `/holdings`, `/transactions`, `/equities`, `/crypto`, `/analytics`, `/news`, `/assistant`, `/settings`.

## UX & PWA
- **Responsive** layout: sidebar (desktop) + bottom nav (mobile).
- **Dark theme** with semantic design tokens (oklch).
- **Inter + JetBrains Mono** typography tuned for mobile readability.
- **Installable PWA** with manifest + service worker (currently a kill-switch SW to clear stale caches).
- **Install prompt** component.
- Toast notifications (sonner), symbol autocomplete, holding details drawer, ticker links.

## Backend (Lovable Cloud)
- TanStack server functions for quotes, extended quotes, events, news, research, symbol search, and assistant chat.
- Supabase auth scaffolding (`auth-middleware`, `auth-attacher`) wired into `start.ts`.

## Data Persistence
- Zustand store persisted to `localStorage` (`portfolio-store`) with versioned migration and seed data.
