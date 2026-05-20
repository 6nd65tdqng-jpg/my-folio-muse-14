DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.portfolio_data'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.portfolio_data
      ADD CONSTRAINT portfolio_data_pkey PRIMARY KEY (user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS touch_portfolio_data_updated_at ON public.portfolio_data;

CREATE TRIGGER touch_portfolio_data_updated_at
BEFORE UPDATE ON public.portfolio_data
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();