ALTER TABLE public.tariffs
  ADD COLUMN feed_in_cost_per_kwh numeric NOT NULL DEFAULT 0,
  ADD COLUMN feed_in_compensation_per_kwh numeric NOT NULL DEFAULT 0;
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.00, feed_in_compensation_per_kwh = 0.05 WHERE supplier = 'Budget Energie';
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.12, feed_in_compensation_per_kwh = 0.07 WHERE supplier = 'Oxxio';
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.09, feed_in_compensation_per_kwh = 0.08 WHERE supplier = 'ANWB Energie';
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.14, feed_in_compensation_per_kwh = 0.06 WHERE supplier = 'Vattenfall';
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.11, feed_in_compensation_per_kwh = 0.09 WHERE supplier = 'Eneco';
UPDATE public.tariffs SET feed_in_cost_per_kwh = 0.00, feed_in_compensation_per_kwh = 0.04 WHERE supplier = 'Greenchoice';
ALTER TABLE public.usage
  ADD COLUMN has_solar boolean NOT NULL DEFAULT false,
  ADD COLUMN annual_grid_import numeric NOT NULL DEFAULT 0,
  ADD COLUMN annual_feed_in numeric NOT NULL DEFAULT 0;
ALTER TABLE public.contracts
  ADD COLUMN feed_in_cost_per_kwh numeric NOT NULL DEFAULT 0,
  ADD COLUMN feed_in_compensation_per_kwh numeric NOT NULL DEFAULT 0;