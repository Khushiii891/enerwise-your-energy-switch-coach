<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI explanation runs in a server function (src/lib/rationale.functions.ts) via Lovable AI (anthropic/claude-haiku-4-5); numbers are always computed server-side by calc.ts, never by the model.
- Household data lives in Lovable Cloud tables (contracts, usage, tariffs, recommendations, feedback); the app requires sign-in.
- Batch recalculation (new tariff ingest, demo reset) lives in src/lib/recalc.server.ts and stores the static explanation (model "static"), never calling the LLM — keeps bulk runs free and deterministic.
- Solar households exclude offers whose 2027 feed-in rates are NULL (Recommendation.unrated); NULL is never coerced to 0 — avoids fake feed-in costs.
- Demo households are real auth users with deterministic UUIDv5 ids, listed in demo_households — lets admin tooling filter/reset them safely.
