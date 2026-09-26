CREATE TABLE public.contracts (
  user_id uuid PRIMARY KEY,
  supplier text NOT NULL,
  tariff_type text NOT NULL DEFAULT 'fixed',
  price_per_kwh numeric NOT NULL,
  price_per_gas numeric NOT NULL,
  contract_end_date date,
  exit_fee numeric NOT NULL DEFAULT 0,
  exit_fee_condition text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contract" ON public.contracts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.usage (
  user_id uuid PRIMARY KEY,
  monthly_electricity numeric NOT NULL,
  monthly_gas numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage TO authenticated;
GRANT ALL ON public.usage TO service_role;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage" ON public.usage FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL UNIQUE,
  kwh_price numeric NOT NULL,
  gas_price numeric NOT NULL,
  contract_length integer NOT NULL,
  promo numeric NOT NULL DEFAULT 0
);
GRANT SELECT ON public.tariffs TO authenticated;
GRANT ALL ON public.tariffs TO service_role;
ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tariffs readable" ON public.tariffs FOR SELECT TO authenticated USING (true);

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  best_supplier text,
  net_savings numeric,
  decision text NOT NULL,
  rationale_text jsonb NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  input_hash text
);
GRANT SELECT, INSERT ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recs read" ON public.recommendations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own recs insert" ON public.recommendations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.recommendations (user_id, input_hash, created_at DESC);

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback read" ON public.feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own feedback insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.recommendations r WHERE r.id = recommendation_id AND r.user_id = auth.uid())
);

INSERT INTO public.tariffs (supplier, kwh_price, gas_price, contract_length, promo) VALUES
 ('Budget Energie', 0.275, 1.30, 12, 0),
 ('Oxxio', 0.288, 1.35, 12, 2.5),
 ('ANWB Energie', 0.299, 1.41, 12, 1.5),
 ('Vattenfall', 0.295, 1.38, 12, 3),
 ('Eneco', 0.305, 1.42, 12, 0),
 ('Greenchoice', 0.31, 1.50, 12, 5);