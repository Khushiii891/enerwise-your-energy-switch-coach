-- Monthly fixed delivery costs (vaste leveringskosten, electricity + gas combined).
-- NULL = not entered: the app then leaves fixed fees out of every comparison.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS fixed_fee_month numeric;
