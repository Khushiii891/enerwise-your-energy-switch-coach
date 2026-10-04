# Enerwise: Your Energy Switch Coach

Build a web app called "Enerwise" — an AI agent that helps Dutch households

decide WHEN to switch energy suppliers, not just compare prices once.

CONTEXT

The Dutch energy market is liberalized with 30+ suppliers. Most households

never switch because comparing tariffs is tedious, so they lose money to a

"loyalty penalty." This app continuously judges timing, it does NOT execute

switches on the user's behalf — it only recommends.

CORE FEATURES

1. Onboarding form ("My Contract")

   Fields: current supplier (dropdown, dummy list: Essent, Vattenfall, Eneco,

   Budget Energie, Greenchoice), tariff type (fixed/dynamic), price per kWh,

   price per m3 gas, contract end date, exit fee amount (€), exit fee

   condition (e.g. "only if switching before end date").

2. Usage form ("My Usage")

   Fields: monthly electricity usage (kWh), monthly gas usage (m3).

   Keep it simple — just numeric inputs, no smart meter integration yet.

3. Market data (seed as dummy/mock data, no real scraping needed)

   Create 6 sample supplier tariff records with: supplier name, kWh price,

   gas price, contract length, and a small monthly discount/promo field.

   Vary prices slightly so some are cheaper, some are not.

4. Dashboard ("My Recommendation")

   Calculate for each mock supplier:

   net_savings = (annual cost with current contract) - (annual cost with

   candidate contract) - (exit fee, only if today < contract end date)

   Show:

   - A card per candidate supplier with computed net annual savings

   - Highlight the best option if net_savings > €50 (this is the "switch

     now" threshold)

   - If no option beats the threshold, show a calm message like

     "Your current contract still looks like the better deal — we'll keep

     watching the market for you."

   - Never show a "Switch now" button that executes anything — only a

     "See offer" external link placeholder and a short explanatory sentence

     on why this is (or isn't) a good time to switch.

5. Simple timeline note

   Below the dashboard, show 1-2 lines reminding the user this is a

   recommendation only, and that switching decisions are always theirs

   to make and execute themselves.

DESIGN

Clean, calm, trustworthy fintech-like aesthetic — not flashy. Use a

color palette suggesting savings/green plus neutral grays. Mobile-friendly.

DATA

Use in-memory/mock state for now (no need for a real backend or database

in this prototype) — the goal is to demonstrate the calculation and

recommendation logic clearly, not real data integration.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c2926ee2-c958-4169-8583-f4d0378249e8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
