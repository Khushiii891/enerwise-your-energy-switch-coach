# Enerwise Phase 2 — saved accounts + AI-written explanation

## What you'll get
- Sign up / sign in with email and password; each household's contract and usage are saved to their account (no more browser-only storage).
- The dashboard numbers stay exactly as today (same formula, same €50 threshold), always calculated by Enerwise.
- The explanation text on the dashboard is written by Claude (Anthropic) using only those numbers: a headline, a short rationale, and a smaller caveat, with the label "AI-generated explanation — numbers calculated by Enerwise".
- A "Regenerate" button, thumbs up / thumbs down feedback, and an EN/NL language toggle for the explanation.
- If the AI call fails, the current built-in explanation is shown instead.
- Still no switching: "See offer" stays a placeholder link. Design, timeline note and mobile layout stay the same.

## What you'll need to provide
- An Anthropic API key (from console.anthropic.com → API Keys). I'll open a secure form for it after approval; it is never visible in the app.

## Steps
1. Turn on Lovable Cloud (database + login).
2. Create tables: contracts, usage, tariffs (pre-filled with the 6 current suppliers), recommendations, feedback — each private to its owner (tariffs readable by everyone signed in).
3. Add a sign-in page; the Recommendation, Contract and Usage pages require sign-in. Header gets a sign-out button.
4. Contract and Usage forms load and save from the database; the dashboard reads tariffs from the database, falling back to the built-in list.
5. Build "generate-rationale" on the server: sends contract, usage, days until contract end, exit-fee status, top 3 candidates (annual cost + net savings), decision (switch_now / wait) and language to Claude; uses your system prompt verbatim with PROMPT_VERSION "v1"; parses the JSON reply; saves it to recommendations with model and prompt version.
6. Update the dashboard: AI headline + rationale + caveat, label, Regenerate, feedback buttons (saved to feedback, linked to that recommendation).
7. Test end to end while signed in: save contract, see generated explanation, regenerate, leave feedback.

## Technical details
- One deviation from the brief: this project runs server code as built-in server functions instead of separate edge functions. "generate-rationale" will be a server function (auth-protected, `src/lib/rationale.functions.ts`) — same behaviour, key stays server-side.
- Anthropic called directly via `fetch` to `https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5-20251001`, `max_tokens: 400`, secret `ANTHROPIC_API_KEY`, as requested (not the Lovable AI gateway).
- Calculation stays in `src/lib/calc.ts`; the LLM only receives precomputed values. Numbers shown are never taken from the LLM output.
- Tables: `contracts` and `usage` (one row per user, upsert), `tariffs` (seeded in migration), `recommendations` (user_id, created_at, best_supplier, net_savings, decision, rationale_text JSON/text with headline/rationale/caveat, model, prompt_version), `feedback` (recommendation_id, user_id, helpful, comment, created_at). GRANTs + RLS scoped to `auth.uid()`.
- Fallback: on HTTP error, timeout or JSON parse error, return the existing `explain()` text as rationale with `model: "fallback"`.
- Generation triggers when the dashboard loads with new inputs (cached by input hash to avoid repeated calls) and on Regenerate.
