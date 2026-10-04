ALTER TABLE public.tariffs ADD COLUMN tariff_type text NOT NULL DEFAULT 'fixed';
UPDATE public.tariffs SET tariff_type = 'dynamic' WHERE supplier IN ('ANWB Energie', 'Oxxio');

CREATE TABLE public.control_settings (
  user_id uuid PRIMARY KEY,
  mode text NOT NULL DEFAULT 'recommend' CHECK (mode IN ('recommend','auto')),
  min_savings numeric NOT NULL DEFAULT 100,
  allowed_types text[] NOT NULL DEFAULT ARRAY['fixed','dynamic'],
  excluded_suppliers text[] NOT NULL DEFAULT ARRAY[]::text[],
  cancel_window_days integer NOT NULL DEFAULT 7 CHECK (cancel_window_days BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.control_settings TO authenticated;
GRANT ALL ON public.control_settings TO service_role;
ALTER TABLE public.control_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.control_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read settings" ON public.control_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.planned_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supplier text NOT NULL,
  net_savings numeric NOT NULL,
  planned_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','cancelled','completed')),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.planned_switches TO authenticated;
GRANT ALL ON public.planned_switches TO service_role;
ALTER TABLE public.planned_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own switches read" ON public.planned_switches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own switches insert" ON public.planned_switches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'planned');
CREATE POLICY "own switches update" ON public.planned_switches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read switches" ON public.planned_switches FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX planned_switches_user_idx ON public.planned_switches (user_id, created_at DESC);