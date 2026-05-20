DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quote_cache'
      AND policyname = 'Anyone can read quote cache'
  ) THEN
    CREATE POLICY "Anyone can read quote cache"
    ON public.quote_cache
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;