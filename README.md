# kAIte — next product, explained

> Banks see **payments**. Customers have **plans**.  
> kAIte bridges that gap _inside_ the banking app: right product, right moment, with a clear **why**.

This repo is a **KBC Mobile–style** dark-mode demo (hackathon) with a full interactive shell plus a live **ML recommendation layer** powered by `src/model.joblib` and **SHAP**.

---

## Pitch

A salary lands. Rent goes out. A notary fee appears. Fuel and IKEA spike. That ledger is not noise — it is an early signal of a life step (home, car, trip, health, buffer, credit need).

**kAIte** turns that into:

1. a short question when you open the app
2. ranked **next-product** suggestions on Start
3. a tap on **(i)** → SHAP drivers (what raised / lowered the chance)
4. a CTA that opens the matching journey (loan, insure, save, MyHome, …)

Loop: **detect → ask → score → explain → convert**.

---

## What’s in the app

The UI is a phone-framed replica of KBC Mobile with five bottom tabs and extra hubs/flows on top.

### Bottom navigation

| Tab          | What you get                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Start**    | Accounts carousel, payments preview, **kAIte** suggestions, “Voor jou” feed. Hub chips: Rekeningen, MyNWS, **MyHome**, MyMobility. |
| **Mijn KBC** | Overview: rekeningen (IBAN), betaalmiddelen, Kate Coins, beleggingen / leningen placeholders.                                      |
| **Beleggen** | Spaar- & beleggingsproducten, “In de kijker” tip, beleggingsplan CTA.                                                              |
| **Zakelijk** | Org filter (VZW’s), business accounts & debit card, FAB for overschrijving.                                                        |
| **Aanbod**   | Promo’s, KBC-product tiles, thema’s (MyHome, MyMobility, duurzaam, …).                                                             |

### Start — Rekeningen

- Status bar + search: **“Hoe kan ik je helpen?”** (Kate).
- Account cards: **Kate Coins**, personal & VZW accounts, Favorieten.
- **Toon / Verberg betalingen** — first lines of the demo ledger.
- **kAIte · Volgend product** — main recommendation surface (see below).
- **Voor jou** — dismissible tips / actions (Te behandelen, Kate tip, gegevens updaten, …).
- Floating **+** FAB → nieuwe overschrijving (demo toast).

### Start — MyHome

Home hub with blue chrome:

- Hero **“Waar woon je?”** → woning toevoegen.
- Plan tabs: **Kopen / Verbouwen / Verkopen / Verzekeren** (Kopen is fleshed out).
- Budget teaser, zoekcriteria, Immoweb-style listings (city, price, EPC).
- **Lenen voor je woning** → opens the loan flow (hypotheek).
- Discover cards: brandverzekering, renovatie, energiezuiniger.

### Questionnaire modal (every launch)

On each app start, a **full-screen blurred modal** asks **one random question** from the catalog:

| Kind           | Examples                                                        | Purpose                                  |
| -------------- | --------------------------------------------------------------- | ---------------------------------------- |
| **Signal**     | Buying a home? New car? Traveling? Tight month? Unused Spotify? | Life-event prompts tied to spend stories |
| **Preference** | #1 money goal? Guidance style? Invest sustainably?              | Soft profile for the model               |
| **Pulse**      | Money this week? Big expense coming? Tip useful?                | Short check-ins                          |

- Every chip answer **routes somewhere** (loan / insure / save / mobility flow, MyHome, Beleggen, Aanbod, Mijn KBC, security toast, …).
- Answers are stored in `localStorage` and sent as features on the next recommend call.
- Skip (×) dismisses without scoring boost.

### kAIte — next product

On Start · Rekeningen:

- Ranked list of suggested products (from the API, typically top 3).
- Per card: title, short reason, **kans %**, **lift ×**, verdienmodel chip (Lenen, Verzekeren, Sparen, …).
- **Info (i)** → SHAP sheet: Dutch feature labels, your value, **±X.X pp** (verhoogt / verlaagt de kans).
- CTA opens the mapped journey (see flows).
- Evidence line: “Gebaseerd op o.a. Immoweb, Notaris, …”
- If the API is down → **rules-engine fallback** (still useful copy, no SHAP).

**Products the model scores**

| Key               | Shown as                     | Typical CTA               |
| ----------------- | ---------------------------- | ------------------------- |
| `reisverzekering` | Reisverzekering              | Insure flow               |
| `woonkrediet`     | Woon- / verbouwkrediet       | Loan (hypotheek) / MyHome |
| `autolening`      | Autolening / -verzekering    | Loan (auto)               |
| `hospitalisatie`  | Hospitalisatieverzekering    | Insure flow               |
| `sparen`          | Sparen of beleggen           | Save flow / Beleggen      |
| `kredietkaart`    | Kredietkaart / hogere limiet | Aanbod-style tip          |

### Product & loan flows

Full-screen sheets over the phone:

**Loan wizard** (`LoanFlow`) — type → amount → duration → summary → done

- Types: hypothecaire, overbrugging, energie, renovatie, auto, fiets, moto, camper, boot.
- APR chips, monthly payment estimate, optional related insurance, Kate Coins on completion.
- Can be prefilled (e.g. MyHome / woonkrediet → hypotheek).

**Product pickers** (`ProductFlow`)

| Kind       | Title                  | Options (demo)                                                   |
| ---------- | ---------------------- | ---------------------------------------------------------------- |
| `insure`   | Kies een verzekering   | Brand, Auto, Familiale, Hospitalisatie, Schuldsaldo, Leven, Reis |
| `save`     | Sparen & pensioen      | Spaarrekening, Huurwaarborg, Pensioensparen, tak 21/23, Termijn  |
| `mobility` | Niet-bancaire diensten | Tickets, Parking, Q8, Vignet, Kate Coins                         |

### Verdienmodellen (labels on suggestions)

Betalen · Sparen · Beleggen · Lenen · Verzekeren · Mobiliteit · Zakelijk — used as chips so each tip maps to a KBC revenue story.

---

## Demo data

`src/data/transactions.ts` is a rich fake ledger (~100+ lines): salary, rent, groceries, energy, fuel, NMBS/De Lijn, Spotify, DIY / furniture, health, savings transfers, etc.

It drives:

- the **betalingen** preview on Start
- **feature building** in the recommend API
- the **rules fallback** when the model API is offline

Edit that file to change who the “customer” looks like.

---

## How recommendations work

```text
┌──────────────────────────┐         POST /api/recommend         ┌─────────────────────────┐
│  React app (Vite)        │  txs + profile + questionnaire ──►  │  FastAPI                 │
│  Start · kAIte banner    │  ◄── top products + SHAP drivers    │  server/recommend_api.py │
│  questionnaires / flows  │                                     │  loads src/model.joblib  │
└──────────────────────────┘                                     └─────────────────────────┘
            │                                                              ▲
            │ recentTransactions                                           │ trained by
            ▼                                                              │
   src/data/transactions.ts                                      train_model.py
```

1. App sends recent transactions + a light demo profile + questionnaire features.
2. API maps merchants/categories → spend buckets (wonen, auto, reizen, …), builds the same feature shape as training.
3. Six **HistGradientBoosting** classifiers output probabilities; ranking uses **lift** vs average customer (with soft priors / Q&A boosts / DTI stress blocks for credit products).
4. For each shown product, **SHAP** (permutation) explains the top drivers vs a background sample stored in the joblib.
5. Frontend maps keys → Dutch titles, verdienmodel, and CTA.

Offline → `src/recommendations/rulesEngine.ts` heuristics only.

---

## Run locally

**Need:** Node 20+, **Python 3.12+** (artifact needs scikit-learn 1.8 / pandas 3).

```bash
# Terminal 1 — ML API
py -3.12 -m pip install -r server/requirements.txt
npm run dev:api

# Terminal 2 — UI
npm install
npm run dev
```

Open **http://localhost:5173** (Vite proxies `/api` → `localhost:8000`).

Health check: `GET http://127.0.0.1:8000/api/health`.

### Suggested walkthrough

1. Launch → answer (or skip) the questionnaire.
2. Start → scroll to **kAIte** → read the ranked products.
3. Tap **(i)** → read SHAP drivers.
4. Tap a CTA → complete a flow (e.g. woonkrediet → lening).
5. Open **MyHome** from the hub chips; try **Lenen voor je woning**.
6. Peek **Aanbod**, **Beleggen**, **Zakelijk**, **Mijn KBC** for the full replica.

Optional retrain:

```bash
py -3.12 train_model.py --data-dir ./data --save src/model.joblib
```

---

## Repo map

| Path                       | Role                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `src/App.tsx`              | Phone shell, all tabs/hubs, kAIte UI, SHAP sheet, wiring    |
| `src/App.css`              | KBC dark theme, modals, flows                               |
| `src/data/transactions.ts` | Demo payment history                                        |
| `src/questionnaires/`      | Catalog, localStorage store, modal, random picker           |
| `src/recommendations/`     | Fetch API, model→CTA map, rules fallback, loan product defs |
| `src/flows/LoanFlow.tsx`   | Loan wizard + insure/save/mobility pickers                  |
| `src/model.joblib`         | Trained classifiers + SHAP background                       |
| `train_model.py`           | Offline training, ranking, SHAP helpers                     |
| `server/recommend_api.py`  | FastAPI scoring + SHAP                                      |
| `server/requirements.txt`  | Python deps (`shap`, `scikit-learn==1.8.0`, …)              |

---

## Stack

- **Frontend:** React 19, TypeScript, Vite 5
- **Backend:** FastAPI, joblib, scikit-learn, SHAP
- **UX:** Dutch KBC-inspired mobile UI, questionnaires, explainable next-product cards, end-to-end product flows

---

Demo only — not affiliated with KBC.
