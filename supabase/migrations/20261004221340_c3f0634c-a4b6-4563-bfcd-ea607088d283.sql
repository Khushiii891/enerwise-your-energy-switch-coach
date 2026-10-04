CREATE TABLE public.demo_households (
  household_id text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  persona text NOT NULL,
  customer_type text NOT NULL,
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_households TO authenticated;
GRANT ALL ON public.demo_households TO service_role;
ALTER TABLE public.demo_households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read demo households" ON public.demo_households
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));