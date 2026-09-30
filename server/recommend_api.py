"""
kAIte recommendation API — loads src/model.joblib and scores products
from recent transactions (same feature logic as train_model.py), with SHAP drivers.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "src" / "model.joblib"

MIN_LIFT = 1.1
MIN_PROB = 0.03

PRODUCTS = {
    "reisverzekering": dict(
        label="Reisverzekering",
        cat="reizen",
        stress_block=False,
        reason="reis-uitgaven",
        direction=1,
    ),
    "woonkrediet": dict(
        label="Woon-/verbouwkrediet",
        cat="wonen",
        stress_block=True,
        reason="uitgaven aan wonen/verbouwen",
        direction=1,
    ),
    "autolening": dict(
        label="Autolening / autoverzekering",
        cat="auto",
        stress_block=True,
        reason="auto-gerelateerde uitgaven",
        direction=1,
    ),
    "hospitalisatie": dict(
        label="Hospitalisatie-/gezondheidsverzekering",
        cat="gezondheid",
        stress_block=False,
        reason="zorguitgaven",
        direction=1,
    ),
    "sparen": dict(
        label="Spaarrekening / beleggen",
        cat=None,
        stress_block=False,
        reason="totale uitgaven (daling = ruimte om te sparen)",
        direction=-1,
    ),
    "kredietkaart": dict(
        label="Kredietkaart / hogere limiet",
        cat=None,
        stress_block=True,
        reason="totale uitgaven",
        direction=1,
    ),
}
PROD_KEYS = list(PRODUCTS)

FEATURE_NL = {
    "rec_total": "gemiddelde maandelijkse uitgaven",
    "chg_total": "verandering totale uitgaven",
    "trend_3m": "uitgaventrend laatste 3 maanden",
    "last_vs_avg": "laatste maand t.o.v. gemiddelde",
    "ntx_per_month": "transacties per maand",
    "avg_ticket": "gemiddeld bedrag per transactie",
    "cutoff_month": "maand van het jaar",
    "age": "leeftijd",
    "yearly_income": "jaarinkomen",
    "per_capita_income": "inkomen per hoofd",
    "total_debt": "totale schuld",
    "credit_score": "kredietscore",
    "num_credit_cards": "aantal kredietkaarten",
    "debt_to_income": "schuld/inkomen",
    "spend_to_income": "uitgaven/inkomen",
    "is_female": "geslacht (vrouw=1)",
}

CAT_MAP = {
    "housing": "wonen",
    "rent": "wonen",
    "furniture": "wonen",
    "renovation": "wonen",
    "energy": "nuts_telecom",
    "car": "auto",
    "bike": "vrije_tijd",
    "mobility": "brandstof_transport",
    "parking": "brandstof_transport",
    "health": "gezondheid",
    "groceries": "dagelijks",
    "subscriptions": "vrije_tijd",
    "shopping": "shopping",
    "savings": "financieel",
    "travel": "reizen",
    "income": None,
}

MERCHANT_HINTS = [
    ("immoweb", "wonen"),
    ("notaris", "wonen"),
    ("ikea", "wonen"),
    ("huur", "wonen"),
    ("brico", "wonen"),
    ("isolatie", "wonen"),
    ("fluvius", "nuts_telecom"),
    ("shell", "brandstof_transport"),
    ("q8", "brandstof_transport"),
    ("total", "brandstof_transport"),
    ("nmbs", "brandstof_transport"),
    ("de lijn", "brandstof_transport"),
    ("4411", "brandstof_transport"),
    ("parking", "brandstof_transport"),
    ("bike", "vrije_tijd"),
    ("fiets", "vrije_tijd"),
    ("uz ", "gezondheid"),
    ("spotify", "vrije_tijd"),
    ("colruyt", "dagelijks"),
    ("ryanair", "reizen"),
    ("booking", "reizen"),
    ("hotel", "reizen"),
]


class TxIn(BaseModel):
    id: str | None = None
    merchant: str = ""
    amount: float
    category: str = "overig"
    date: str | None = None


class ProfileIn(BaseModel):
    age: int = 32
    yearly_income: float = 42000
    per_capita_income: float = 42000
    total_debt: float = 8000
    credit_score: float = 720
    num_credit_cards: int = 1
    is_female: int = 0


class RecommendRequest(BaseModel):
    transactions: list[TxIn] = Field(default_factory=list)
    profile: ProfileIn = Field(default_factory=ProfileIn)
    questionnaire: dict[str, Any] = Field(default_factory=dict)
    top_n: int = 3
    use_shap: bool = True


bundle: dict[str, Any] | None = None


def load_bundle() -> dict[str, Any]:
    global bundle
    if bundle is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
        bundle = joblib.load(MODEL_PATH)
    return bundle


def feature_label(name: str) -> str:
    if name in FEATURE_NL:
        return FEATURE_NL[name]
    for prefix, text in (
        ("rec_", "maandelijkse uitgaven {}"),
        ("share_", "aandeel {} in uitgaven"),
        ("chg_", "verandering uitgaven {}"),
    ):
        if name.startswith(prefix):
            return text.format(name[len(prefix) :].replace("_", " "))
    return name


def format_feature_value(name: str, v: float) -> str:
    if v != v:
        return "onbekend"
    if name.startswith("chg_") or name == "trend_3m":
        return f"{np.expm1(v):+.0%}"
    if name.startswith("share_"):
        return f"{v:.0%}"
    if name in ("debt_to_income", "spend_to_income", "last_vs_avg"):
        return f"{v:.2f}"
    return f"{v:,.0f}"


def explain_prediction(model, X_row: pd.DataFrame, feat_cols, background: pd.DataFrame, top=3):
    """SHAP drivers in probability units (+0.05 = +5 pp vs background population)."""
    try:
        import shap
    except ImportError:
        return None
    try:
        def f(A):
            return model.predict_proba(pd.DataFrame(A, columns=feat_cols))[:, 1]

        masker = shap.maskers.Independent(
            background[feat_cols].to_numpy(dtype=float),
            max_samples=len(background),
        )
        explainer = shap.Explainer(f, masker, algorithm="permutation")
        sv = explainer(X_row[feat_cols].to_numpy(dtype=float), max_evals=2 * len(feat_cols) + 1)
        vals = np.asarray(sv.values)[0]
    except Exception as e:
        print(f"  ! SHAP failed: {e}")
        return None
    order = np.argsort(-np.abs(vals))[:top]
    return [
        dict(
            feature=feat_cols[i],
            label=feature_label(feat_cols[i]),
            value=format_feature_value(feat_cols[i], float(X_row[feat_cols[i]].iloc[0])),
            effect=float(vals[i]),
        )
        for i in order
        if abs(vals[i]) > 1e-4
    ]


def resolve_cat(tx: TxIn, cats: list[str]) -> str | None:
    if tx.category.lower() == "income":
        return None
    merchant = tx.merchant.lower()
    for hint, cat in MERCHANT_HINTS:
        if hint in merchant:
            return cat if cat in cats else "overig"
    mapped = CAT_MAP.get(tx.category.lower())
    if mapped and mapped in cats:
        return mapped
    return "overig"


def build_month_matrix(
    transactions: list[TxIn], cats: list[str], history: int, baseline: int
) -> tuple[np.ndarray, np.ndarray]:
    n_months = baseline
    arr = np.zeros((1, n_months, len(cats)), dtype=np.float32)
    ntx = np.zeros((1, n_months), dtype=np.float32)
    cat_idx = {c: i for i, c in enumerate(cats)}

    spend: dict[str, float] = {c: 0.0 for c in cats}
    counts: dict[str, int] = {c: 0 for c in cats}
    for tx in transactions:
        if float(tx.amount) > 0:
            continue
        cat = resolve_cat(tx, cats)
        if cat is None:
            continue
        spend[cat] += abs(float(tx.amount))
        counts[cat] += 1

    total = sum(spend.values())
    baseline_months = baseline - history
    for m in range(0, baseline_months):
        for c, i in cat_idx.items():
            arr[0, m, i] = (spend[c] / max(history, 1)) * 0.35
            ntx[0, m] += max(counts[c] / max(history, 1), 0.2) * 0.35
    for m in range(baseline_months, n_months):
        for c, i in cat_idx.items():
            arr[0, m, i] = (spend[c] / max(history, 1)) * 1.4
            ntx[0, m] += max(counts[c] / max(history, 1), 0.3)

    if total < 1:
        arr[0, -1, cat_idx["dagelijks"]] = 50.0
        ntx[0, -1] = 2.0

    return arr, ntx


def make_features_row(
    arr: np.ndarray,
    ntx: np.ndarray,
    cats: list[str],
    history: int,
    baseline: int,
    profile: ProfileIn,
    feat_cols: list[str],
) -> pd.DataFrame:
    t = arr.shape[1]
    recent = arr[:, t - history : t].sum(1)
    prev = arr[:, t - baseline : t - history].sum(1)
    rec_tot, prev_tot = recent.sum(1), prev.sum(1)
    f: dict[str, Any] = {}
    for k, cat in enumerate(cats):
        f[f"rec_{cat}"] = recent[:, k] / history
        f[f"share_{cat}"] = recent[:, k] / (rec_tot + 1)
        f[f"chg_{cat}"] = np.log1p(recent[:, k]) - np.log1p(prev[:, k])
    f["rec_total"] = rec_tot / history
    f["chg_total"] = np.log1p(rec_tot) - np.log1p(prev_tot)
    f["trend_3m"] = np.log1p(arr[:, t - 3 : t].sum((1, 2))) - np.log1p(
        arr[:, t - 6 : t - 3].sum((1, 2))
    )
    f["last_vs_avg"] = arr[:, t - 1].sum(1) / (rec_tot / history + 1)
    n_rec = ntx[:, t - history : t].sum(1)
    f["ntx_per_month"] = n_rec / history
    f["avg_ticket"] = rec_tot / (n_rec + 1)
    f["cutoff_month"] = np.array([t % 12], dtype=np.float32)
    f["age"] = np.array([profile.age], dtype=np.float32)
    f["yearly_income"] = np.array([profile.yearly_income], dtype=np.float32)
    f["per_capita_income"] = np.array([profile.per_capita_income], dtype=np.float32)
    f["total_debt"] = np.array([profile.total_debt], dtype=np.float32)
    f["credit_score"] = np.array([profile.credit_score], dtype=np.float32)
    f["num_credit_cards"] = np.array([profile.num_credit_cards], dtype=np.float32)
    f["debt_to_income"] = np.array(
        [profile.total_debt / (profile.yearly_income + 1)], dtype=np.float32
    )
    f["spend_to_income"] = (rec_tot * 12 / history) / (profile.yearly_income + 1)
    f["is_female"] = np.array([profile.is_female], dtype=np.float32)
    df = pd.DataFrame(f)
    for c in feat_cols:
        if c not in df.columns:
            df[c] = 0.0
    return df[feat_cols]


def predict_proba(models: dict, X: pd.DataFrame, prevalence: dict) -> np.ndarray:
    cols = []
    for key in PROD_KEYS:
        m = models.get(key)
        if m is not None:
            cols.append(m.predict_proba(X)[:, 1])
        else:
            cols.append(np.full(len(X), float(prevalence.get(key, 0.05))))
    return np.column_stack(cols)


app = FastAPI(title="kAIte recommend API", version="1.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    load_bundle()


@app.get("/api/health")
def health():
    b = load_bundle()
    return {
        "ok": True,
        "products": list(b["models"].keys()),
        "n_features": len(b["feat_cols"]),
        "has_shap_background": b.get("background") is not None,
    }


@app.post("/api/recommend")
def recommend(req: RecommendRequest):
    b = load_bundle()
    models = b["models"]
    feat_cols = b["feat_cols"]
    prevalence = {k: float(v) for k, v in b["prevalence"].items()}
    cfg = b["config"]
    cats = list(cfg["CATS"])
    history = int(cfg["HISTORY"])
    baseline = int(cfg["BASELINE"])
    dti_limit = float(cfg["DTI_LIMIT"])
    background = b.get("background") if req.use_shap else None

    arr, ntx = build_month_matrix(req.transactions, cats, history, baseline)
    all_needed = list(
        dict.fromkeys(
            feat_cols
            + [f"chg_{c}" for c in cats]
            + [
                "chg_total",
                "debt_to_income",
                "share_wonen",
                "share_auto",
                "share_brandstof_transport",
                "share_reizen",
                "share_gezondheid",
            ]
        )
    )
    X_all = make_features_row(arr, ntx, cats, history, baseline, req.profile, all_needed)
    probs = predict_proba(models, X_all[feat_cols], prevalence)[0]

    # Soft category prior for short synthetic histories
    prior = {
        "reisverzekering": float(X_all["share_reizen"].iloc[0]),
        "woonkrediet": float(X_all["share_wonen"].iloc[0]),
        "autolening": float(X_all["share_auto"].iloc[0])
        + 0.5 * float(X_all["share_brandstof_transport"].iloc[0]),
        "hospitalisatie": float(X_all["share_gezondheid"].iloc[0]),
        "sparen": max(0.0, -float(X_all["chg_total"].iloc[0]) * 0.1),
        "kredietkaart": 0.0,
    }
    for j, key in enumerate(PROD_KEYS):
        probs[j] = float(np.clip(probs[j] + 0.55 * prior.get(key, 0.0), 0.0, 0.99))

    q = req.questionnaire or {}
    if q.get("intent_buy_home"):
        probs[PROD_KEYS.index("woonkrediet")] = float(
            np.clip(probs[PROD_KEYS.index("woonkrediet")] + 0.25, 0, 0.99)
        )
    if q.get("intent_new_car"):
        probs[PROD_KEYS.index("autolening")] = float(
            np.clip(probs[PROD_KEYS.index("autolening")] + 0.25, 0, 0.99)
        )
    if q.get("intent_travel"):
        probs[PROD_KEYS.index("reisverzekering")] = float(
            np.clip(probs[PROD_KEYS.index("reisverzekering")] + 0.25, 0, 0.99)
        )
    if q.get("intent_family"):
        probs[PROD_KEYS.index("hospitalisatie")] = float(
            np.clip(probs[PROD_KEYS.index("hospitalisatie")] + 0.15, 0, 0.99)
        )
    if q.get("money_goal") == "grow" or q.get("sustainable_invest") is True:
        probs[PROD_KEYS.index("sparen")] = float(
            np.clip(probs[PROD_KEYS.index("sparen")] + 0.2, 0, 0.99)
        )
    if q.get("money_goal") == "home":
        probs[PROD_KEYS.index("woonkrediet")] = float(
            np.clip(probs[PROD_KEYS.index("woonkrediet")] + 0.2, 0, 0.99)
        )
    if isinstance(q.get("save_raise_pct"), (int, float)) and q["save_raise_pct"] > 0:
        probs[PROD_KEYS.index("sparen")] = float(
            np.clip(probs[PROD_KEYS.index("sparen")] + 0.2, 0, 0.99)
        )
    if q.get("big_expense_coming"):
        probs[PROD_KEYS.index("kredietkaart")] = float(
            np.clip(probs[PROD_KEYS.index("kredietkaart")] + 0.1, 0, 0.99)
        )

    stressed = float(X_all["debt_to_income"].iloc[0]) > dti_limit
    lifts = np.array([probs[j] / max(prevalence.get(key, 1e-6), 1e-6) for j, key in enumerate(PROD_KEYS)])

    ranked = []
    for j in np.argsort(-lifts):
        key = PROD_KEYS[j]
        meta = PRODUCTS[key]
        blocked = bool(stressed and meta["stress_block"])
        chg_col = f"chg_{meta['cat']}" if meta["cat"] else "chg_total"
        chg = float(X_all[chg_col].iloc[0]) if chg_col in X_all.columns else 0.0
        direction = meta["direction"]
        signal = float(np.expm1(chg * direction)) if direction > 0 else float(np.expm1(-chg))
        if signal >= 0.2:
            verb = "gedaald" if direction < 0 else "gestegen"
            reason = f"{meta['reason']} {verb} t.o.v. eerdere maanden"
        else:
            reason = f"score uit klantprofiel / patroon ({meta['reason']})"

        ranked.append(
            {
                "key": key,
                "label": meta["label"],
                "probability": float(probs[j]),
                "prevalence": float(prevalence.get(key, 0)),
                "avg_probability": float(prevalence.get(key, 0)),
                "lift": float(lifts[j]),
                "blocked": blocked,
                "reason": reason,
                "stress_block": meta["stress_block"],
                "drivers": None,
            }
        )

    # Prefer domain fit for short histories
    shown = [r for r in ranked if not r["blocked"]]
    share_wonen = float(X_all["share_wonen"].iloc[0])
    share_auto = float(X_all["share_auto"].iloc[0]) + float(X_all["share_brandstof_transport"].iloc[0])
    if share_wonen >= 0.35:
        shown.sort(key=lambda r: (0 if r["key"] == "woonkrediet" else 1, -r["lift"]))
    elif share_auto >= 0.25:
        shown.sort(key=lambda r: (0 if r["key"] == "autolening" else 1, -r["lift"]))
    else:
        # Prefer lift ≥ MIN_LIFT & prob ≥ MIN_PROB, else keep lift order
        strong = [r for r in shown if r["lift"] >= MIN_LIFT and r["probability"] >= MIN_PROB]
        shown = strong if strong else shown

    shown = shown[: req.top_n]

    # SHAP for displayed products only (slow)
    if background is not None:
        X_shap = X_all[feat_cols]
        for r in shown:
            m = models.get(r["key"])
            if m is None:
                continue
            drivers = explain_prediction(m, X_shap, feat_cols, background)
            r["drivers"] = drivers

    evidence = []
    for tx in req.transactions:
        if abs(tx.amount) > 0 and tx.category.lower() != "income":
            evidence.append(tx.merchant)
    evidence = evidence[:5]

    return {
        "source": "model.joblib",
        "stressed": stressed,
        "profile": req.profile.model_dump(),
        "questionnaire": q,
        "top": shown,
        "all": ranked,
        "evidence": evidence,
        "shap": True if background is not None else False,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("recommend_api:app", host="127.0.0.1", port=8000, reload=True)
