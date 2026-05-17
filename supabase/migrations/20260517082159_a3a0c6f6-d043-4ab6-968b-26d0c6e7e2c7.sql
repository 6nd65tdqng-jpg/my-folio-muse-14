CREATE TABLE public.quote_cache (
  symbol TEXT PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL,
  prev_close DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_cache ENABLE ROW LEVEL SECURITY;

-- No policies = no client access. Only the service-role server client can read/write.
CREATE INDEX idx_quote_cache_updated_at ON public.quote_cache(updated_at);