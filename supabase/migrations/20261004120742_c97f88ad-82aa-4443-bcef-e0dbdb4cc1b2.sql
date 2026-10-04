ALTER TABLE public.usage
  ADD COLUMN panel_count integer,
  ADD COLUMN panel_wattage integer,
  ADD COLUMN orientation text,
  ADD COLUMN shading text,
  ADD COLUMN has_battery boolean,
  ADD COLUMN total_usage_kwh numeric,
  ADD COLUMN estimate_used boolean NOT NULL DEFAULT false;