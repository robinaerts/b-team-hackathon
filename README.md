# B-Team Hackathon — kAIte next product

KBC Mobile–style demo where **kAIte** suggests the next financial product from someone’s **transaction behaviour**, and explains _why_ with **SHAP**.

## Solution (short)

Banks see payments, not intentions. We treat spend patterns as early signals of a life step (home, car, travel, health, spare cash, credit need).

1. **Signals → questions** — Unusual merchants or patterns trigger short questionnaires (buy a home? traveling?). Answers refine the profile.
2. **Model → next product** — A gradient-boosting model (`train_model.py` → `src/model.joblib`) scores six products from recent spend + a light customer profile.
3. **SHAP → trust** — Each suggestion has an info icon: which features raised or lowered the chance (transparent, not a black box).
4. **Action → flow** — Tapping a suggestion opens the matching journey (loan, insure, save, MyHome, …).

So: detect → ask → score → explain → convert — inside the app the customer already uses.

**Products:** reisverzekering · woonkrediet · autolening · hospitalisatie · sparen · kredietkaart

## Run

Needs **Python 3.12+** (model trained with scikit-learn 1.8 / pandas 3).

```bash
# Terminal 1 — ML API
py -3.12 -m pip install -r server/requirements.txt
npm run dev:api

# Terminal 2 — UI
npm install
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` → port 8000).

## What’s in the repo

| Piece                      | Role                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `src/App.tsx`              | KBC Mobile UI, kAIte banner, questionnaires, product flows |
| `src/data/transactions.ts` | Demo payment history that drives signals + scoring         |
| `src/model.joblib`         | Trained next-product classifiers                           |
| `train_model.py`           | Training, ranking, SHAP helpers                            |
| `server/recommend_api.py`  | FastAPI: features from txs → top products + SHAP drivers   |
| `src/recommendations/`     | API client, product mapping, rules fallback                |
| `src/questionnaires/`      | Signal / preference / pulse questions                      |

If the API is down, the UI falls back to a simple rules engine.

Demo only — not affiliated with KBC.
