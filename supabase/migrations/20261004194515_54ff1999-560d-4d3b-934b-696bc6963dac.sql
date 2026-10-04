drop policy if exists "read runs" on public.scrape_runs;
create policy "admins read runs" on public.scrape_runs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));