#!/usr/bin/env python3
"""
Volgend-product-voorspelling op basis van iemands transacties.
Dataset: Financial Transactions Dataset (Kaggle: computingvictor/transactions-fraud-datasets)

Wat dit script doet
-------------------
1. Laadt transacties en klanten en groepeert uitgaven per maand en categorie.
2. Bouwt per klant en per "peilmoment" features uit het verleden (6 maanden) t.o.v. een
   baseline (maanden 7-12 ervoor).
3. Maakt labels ("welke productbehoefte ontstaat in de 3 maanden erna?").
   LET OP: de dataset bevat GEEN echte productafname. De labels zijn proxy's die uit
   toekomstig uitgavengedrag worden afgeleid (zie PRODUCTS en make_labels).
4. Houdt een deel van de klanten volledig buiten de training (klant-holdout) en traint
   per product een gradient boosting-model op de rest, met een temporele split.
5. Evalueert op (a) bekende klanten in een latere periode en (b) ONBEKENDE klanten in een
   latere periode, en vergelijkt met een "meest populaire product"-baseline.
6. Slaat de getrainde modellen op (joblib) zodat je ze elders kunt gebruiken.
7. Geeft voor 1 klant de top producten, met reden en een geschiktheidsfilter.

Modellen elders gebruiken (geen CSV of hertraining nodig)
---------------------------------------------------------
    from next_product_model import load_bundle, score_new_client
    bundle = load_bundle("next_product_models.joblib")
    out = score_new_client(bundle, transactions_df, profile_dict, cutoff="2019-06")
    # transactions_df: kolommen date, amount, mcc  (minstens 12 maanden voor de cutoff)
    # profile_dict: birth_year, gender, yearly_income, per_capita_income, total_debt,
    #               credit_score, num_credit_cards

Gebruik
-------
    pip install pandas numpy scikit-learn
    python next_product_model.py --data-dir ./data                     # demo met onbekende klant
    python next_product_model.py --data-dir ./data --client 825        # specifieke klant
    python next_product_model.py --data-dir ./data --max-clients 300   # sneller testen
    python next_product_model.py --data-dir ./data --holdout 0.3       # 30% klanten als holdout
    python next_product_model.py --data-dir ./data --demo-top 5        # beste demo-klanten tonen
    python next_product_model.py --data-dir ./data --dti-limit 3       # ander schuldenplafond
    python next_product_model.py --data-dir ./data --no-shap           # zonder SHAP-uitleg

SHAP-uitleg vraagt: pip install shap  (zonder shap valt het script terug op een simpele reden)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score

# --------------------------------------------------------------------------------------
# Configuratie (hier kun je alles bijstellen)
# --------------------------------------------------------------------------------------
HISTORY = 6      # maanden terugkijken voor features
BASELINE = 12    # maanden gebruikt voor "normaal" uitgavenniveau (incl. HISTORY)
HORIZON = 3      # maanden vooruit waarin de behoefte moet ontstaan
STEP = 3         # afstand tussen peilmomenten (= HORIZON, zodat label-vensters niet overlappen)
SPIKE = 1.8      # uitgaven in categorie moeten >= SPIKE x normaal zijn om als "behoefte" te tellen
DTI_LIMIT = 2.0  # schuld / jaarinkomen boven deze grens => geen kredietproducten aanbevelen
                 # (placeholder-regel; overschrijfbaar met --dti-limit)
MIN_TRAIN_POSITIVES = 30
# Labels voor de twee producten die op totale uitgaven gebaseerd zijn
SAVE_DROP = 0.85        # sparen: 3-maandsuitgave <= SAVE_DROP x normaal (was 0.7)
SAVE_MIN_BASE = 300     # sparen: minimale normale 3-maandsuitgave
CREDIT_JUMP = 1.3       # kredietkaart: 3-maandsuitgave >= CREDIT_JUMP x normaal (was 1.5)
CREDIT_MIN_ABS = 500    # kredietkaart: minimale uitgave in het venster
# Aanbevelingen: rangschikken op lift (kans t.o.v. gemiddelde klant) en zwakke signalen weglaten
MIN_LIFT = 1.1          # product moet minstens 10% waarschijnlijker zijn dan gemiddeld
MIN_PROB = 0.03         # en minstens 3% absolute kans hebben

# Categorieen op basis van expliciete MCC-codes (gecontroleerd tegen mcc_codes.json van deze dataset).
# Codes die hier niet in staan vallen onder "overig".
CATEGORY_MCC = {
    "reizen": [3722, 4722, 7011, 3771, 4112, 4511, 4411],
    "brandstof_transport": [5541, 4784, 4121, 4111, 4131],
    "auto": [7538, 7531, 5533, 7542, 7549],
    "wonen": [5211, 5719, 5251, 3504, 3640, 5712, 3174, 5261, 3144, 1711, 5722],
    "gezondheid": [8099, 5912, 8021, 8041, 8011, 8043, 8062, 8049],
    "dagelijks": [5812, 5411, 5814, 5499, 5813, 5921],
    "vrije_tijd": [7996, 5942, 7832, 5815, 5655, 7801, 5192, 5816, 7802, 5941, 5733, 7922,
                   7995, 5970],
    "nuts_telecom": [4900, 4814, 4899, 3780],
    "financieel": [4829, 6300, 7276, 8931, 8111],
    "shopping": [5311, 5310, 5661, 5977, 5651, 5732, 5947, 5621, 5300, 5932, 5094, 5045],
}
MCC_TO_CAT = {code: cat for cat, codes in CATEGORY_MCC.items() for code in codes}
CATS = list(CATEGORY_MCC) + ["overig"]
CAT_IDX = {c: i for i, c in enumerate(CATS)}

# Producten. 'cat' = categorie waarvan een uitgavenpiek de behoefte aanduidt.
# min_abs = minimale uitgave (in dataset-valuta) in het venster om mee te tellen.
# stress_block = niet aanbevelen als de klant financieel onder druk staat.
PRODUCTS = {
    "reisverzekering": dict(label="Reisverzekering", cat="reizen", min_abs=600,
                            stress_block=False, reason="reis-uitgaven", direction=1),
    "woonkrediet": dict(label="Woon-/verbouwkrediet", cat="wonen", min_abs=500,
                        stress_block=True, reason="uitgaven aan wonen/verbouwen", direction=1),
    "autolening": dict(label="Autolening / autoverzekering", cat="auto", min_abs=500,
                       stress_block=True, reason="auto-gerelateerde uitgaven", direction=1),
    "hospitalisatie": dict(label="Hospitalisatie-/gezondheidsverzekering", cat="gezondheid",
                           min_abs=300, stress_block=False, reason="zorguitgaven", direction=1),
    "sparen": dict(label="Spaarrekening / beleggen", cat=None, min_abs=0,
                   stress_block=False, reason="totale uitgaven (daling = ruimte om te sparen)",
                   direction=-1),
    "kredietkaart": dict(label="Kredietkaart / hogere limiet", cat=None, min_abs=0,
                         stress_block=True, reason="totale uitgaven", direction=1),
}
PROD_KEYS = list(PRODUCTS)


# --------------------------------------------------------------------------------------
# Data laden
# --------------------------------------------------------------------------------------
def clean_money(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce")


def prepare_tx(tx: pd.DataFrame) -> pd.DataFrame:
    """Transacties (kolommen date, amount, mcc) -> alleen uitgaven, met categorie en month_abs."""
    tx["amount"] = clean_money(tx["amount"])
    tx = tx[tx["amount"] > 0].copy()              # alleen uitgaven, geen terugbetalingen
    tx["mcc"] = pd.to_numeric(tx["mcc"], errors="coerce")
    tx["cat"] = tx["mcc"].map(MCC_TO_CAT).fillna("overig")
    date = tx["date"].astype(str)
    year = date.str.slice(0, 4).astype("int32")
    month = date.str.slice(5, 7).astype("int32")
    tx["month_abs"] = year * 12 + month - 1
    return tx


def load_data(data_dir: str, max_clients: int | None, seed: int):
    d = Path(data_dir)
    need = ["date", "client_id", "amount", "mcc"]
    try:
        tx = pd.read_csv(d / "transactions_data.csv", usecols=need,
                         dtype={"client_id": "int32", "mcc": "int32"})
    except ValueError as e:
        head = pd.read_csv(d / "transactions_data.csv", nrows=2)
        sys.exit(f"Kolomnamen komen niet overeen ({e}). Gevonden kolommen: {list(head.columns)}. "
                 f"Pas 'need' in load_data aan.")
    users = pd.read_csv(d / "users_data.csv")
    if "id" in users.columns and "client_id" not in users.columns:
        users = users.rename(columns={"id": "client_id"})
    for col in ["yearly_income", "per_capita_income", "total_debt"]:
        users[col] = clean_money(users[col])

    if max_clients:
        rng = np.random.default_rng(seed)
        keep = rng.choice(users["client_id"].to_numpy(), size=min(max_clients, len(users)),
                          replace=False)
        users = users[users["client_id"].isin(keep)]
        tx = tx[tx["client_id"].isin(keep)]

    tx = prepare_tx(tx)
    return tx, users.reset_index(drop=True)


def build_tensors(tx: pd.DataFrame, users: pd.DataFrame):
    """Maakt arr[klant, maand, categorie] (uitgaven) en ntx[klant, maand] (aantal transacties)."""
    active = set(tx["client_id"].unique())
    users = users[users["client_id"].isin(active)].reset_index(drop=True)
    cidx = pd.Series(np.arange(len(users)), index=users["client_id"].to_numpy())
    tx = tx[tx["client_id"].isin(cidx.index)]
    m0, m1 = int(tx["month_abs"].min()), int(tx["month_abs"].max())
    n_months = m1 - m0 + 1
    g = (tx.assign(ci=tx["client_id"].map(cidx).astype(int),
                   mi=(tx["month_abs"] - m0).astype(int),
                   ki=tx["cat"].map(CAT_IDX).astype(int))
           .groupby(["ci", "mi", "ki"])["amount"].agg(["sum", "size"]).reset_index())
    arr = np.zeros((len(users), n_months, len(CATS)), dtype=np.float32)
    arr[g["ci"], g["mi"], g["ki"]] = g["sum"]
    ntx = np.zeros((len(users), n_months), dtype=np.float32)
    np.add.at(ntx, (g["ci"].to_numpy(), g["mi"].to_numpy()), g["size"].to_numpy())
    return arr, ntx, users, m0


# --------------------------------------------------------------------------------------
# Features en labels
# --------------------------------------------------------------------------------------
def make_features(t: int, arr, ntx, users, m0) -> pd.DataFrame:
    """Features voor peilmoment t. Gebruikt ALLEEN maanden < t (geen lekkage)."""
    recent = arr[:, t - HISTORY:t].sum(1)
    prev = arr[:, t - BASELINE:t - HISTORY].sum(1)
    rec_tot, prev_tot = recent.sum(1), prev.sum(1)
    f = {}
    for k, cat in enumerate(CATS):
        f[f"rec_{cat}"] = recent[:, k] / HISTORY
        f[f"share_{cat}"] = recent[:, k] / (rec_tot + 1)
        f[f"chg_{cat}"] = np.log1p(recent[:, k]) - np.log1p(prev[:, k])
    f["rec_total"] = rec_tot / HISTORY
    f["chg_total"] = np.log1p(rec_tot) - np.log1p(prev_tot)
    f["trend_3m"] = (np.log1p(arr[:, t - 3:t].sum((1, 2)))
                     - np.log1p(arr[:, t - 6:t - 3].sum((1, 2))))
    f["last_vs_avg"] = arr[:, t - 1].sum(1) / (rec_tot / HISTORY + 1)
    n_rec = ntx[:, t - HISTORY:t].sum(1)
    f["ntx_per_month"] = n_rec / HISTORY
    f["avg_ticket"] = rec_tot / (n_rec + 1)

    t_abs = m0 + t
    f["cutoff_month"] = np.full(len(users), t_abs % 12)
    df = pd.DataFrame(f)
    df["age"] = (t_abs // 12) - users["birth_year"].to_numpy()
    df["yearly_income"] = users["yearly_income"].to_numpy()
    df["per_capita_income"] = users["per_capita_income"].to_numpy()
    df["total_debt"] = users["total_debt"].to_numpy()
    df["credit_score"] = users["credit_score"].to_numpy()
    df["num_credit_cards"] = users["num_credit_cards"].to_numpy()
    df["debt_to_income"] = users["total_debt"].to_numpy() / (users["yearly_income"].to_numpy() + 1)
    df["spend_to_income"] = (rec_tot * 12 / HISTORY) / (users["yearly_income"].to_numpy() + 1)
    df["is_female"] = (users.get("gender", pd.Series(["Male"] * len(users)))
                       .astype(str).str.lower().eq("female").astype(int).to_numpy())
    return df


def make_labels(t: int, arr, users) -> pd.DataFrame:
    """Proxy-labels: ontstaat er in de HORIZON maanden vanaf t een behoefte? (gebruikt toekomst)"""
    fut = arr[:, t:t + HORIZON].sum(1)
    base = arr[:, t - BASELINE:t].sum(1) / BASELINE * HORIZON  # verwachte 3-maandsuitgave
    fut_tot, base_tot = fut.sum(1), base.sum(1)
    income_med = users["yearly_income"].median()
    lab = {}
    for key, cfg in PRODUCTS.items():
        if cfg["cat"]:
            k = CAT_IDX[cfg["cat"]]
            lab[key] = fut[:, k] >= np.maximum(cfg["min_abs"], SPIKE * base[:, k])
    lab["sparen"] = ((fut_tot <= SAVE_DROP * base_tot) & (base_tot > SAVE_MIN_BASE)
                     & (users["yearly_income"].to_numpy() >= income_med))
    lab["kredietkaart"] = (fut_tot >= CREDIT_JUMP * base_tot) & (fut_tot > CREDIT_MIN_ABS)
    return pd.DataFrame(lab)[PROD_KEYS].astype(int)


def build_dataset(arr, ntx, users, m0) -> pd.DataFrame:
    n_months = arr.shape[1]
    frames = []
    for t in range(BASELINE, n_months - HORIZON + 1, STEP):
        X = make_features(t, arr, ntx, users, m0)
        Y = make_labels(t, arr, users)
        X["t"] = t
        X["client_id"] = users["client_id"].to_numpy()
        active = X["rec_total"] > 0                       # alleen klanten met recente activiteit
        frames.append(pd.concat([X, Y.add_prefix("y_")], axis=1)[active.to_numpy()])
    return pd.concat(frames, ignore_index=True)


# --------------------------------------------------------------------------------------
# Trainen en evalueren
# --------------------------------------------------------------------------------------
def train_models(train: pd.DataFrame, feat_cols):
    models = {}
    for key in PROD_KEYS:
        y = train[f"y_{key}"]
        if y.sum() < MIN_TRAIN_POSITIVES:
            print(f"  ! {key}: te weinig positieve voorbeelden ({int(y.sum())}), overgeslagen")
            models[key] = None
            continue
        m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=4,
                                           random_state=0)
        m.fit(train[feat_cols], y)
        models[key] = m
    return models


def predict_proba(models, X, prevalence) -> np.ndarray:
    cols = []
    for key in PROD_KEYS:
        m = models[key]
        cols.append(m.predict_proba(X)[:, 1] if m is not None
                    else np.full(len(X), prevalence[key]))
    return np.column_stack(cols)


def hit_at_k(P, Y, k):
    has = Y.sum(1) > 0
    if has.sum() == 0:
        return float("nan")
    top = np.argsort(-P, axis=1)[:, :k]
    hits = np.take_along_axis(Y, top, axis=1).any(1)
    return hits[has].mean()


def evaluate(models, test, feat_cols, prevalence, title):
    if len(test) == 0:
        print(f"\n=== {title}: geen testrijen, overgeslagen ===")
        return
    Y = test[[f"y_{k}" for k in PROD_KEYS]].to_numpy()
    P = predict_proba(models, test[feat_cols], prevalence)
    print(f"\n=== {title} ({len(test):,} rijen) ===")
    print(f"{'product':<18}{'basisrate':>10}{'AUC':>8}{'AvgPrec':>10}{'lift':>8}")
    for j, key in enumerate(PROD_KEYS):
        y = Y[:, j]
        if y.sum() == 0 or y.sum() == len(y):
            print(f"{key:<18}{y.mean():>10.3f}{'n.v.t.':>8}")
            continue
        ap = average_precision_score(y, P[:, j])
        print(f"{key:<18}{y.mean():>10.3f}{roc_auc_score(y, P[:, j]):>8.3f}"
              f"{ap:>10.3f}{ap / y.mean():>8.2f}")
    pop_order = np.argsort([-prevalence[k] for k in PROD_KEYS])
    P_pop = np.tile(np.arange(len(PROD_KEYS))[::-1].astype(float), (len(test), 1))
    P_pop[:, pop_order] = np.arange(len(PROD_KEYS), 0, -1)
    print("\nHit-rate (klanten met >=1 echte behoefte; is de behoefte in de top-k?)")
    print(f"{'':<22}{'top-1':>8}{'top-3':>8}")
    print(f"{'Model':<22}{hit_at_k(P, Y, 1):>8.3f}{hit_at_k(P, Y, 3):>8.3f}")
    print(f"{'Meest-populair-baseline':<22}{hit_at_k(P_pop, Y, 1):>8.3f}{hit_at_k(P_pop, Y, 3):>8.3f}")


# --------------------------------------------------------------------------------------
# Aanbeveling voor 1 klant
# --------------------------------------------------------------------------------------
FEATURE_NL = {
    "rec_total": "gemiddelde maandelijkse uitgaven", "chg_total": "verandering totale uitgaven",
    "trend_3m": "uitgaventrend laatste 3 maanden", "last_vs_avg": "laatste maand t.o.v. gemiddelde",
    "ntx_per_month": "transacties per maand", "avg_ticket": "gemiddeld bedrag per transactie",
    "cutoff_month": "maand van het jaar", "age": "leeftijd", "yearly_income": "jaarinkomen",
    "per_capita_income": "inkomen per hoofd", "total_debt": "totale schuld",
    "credit_score": "kredietscore", "num_credit_cards": "aantal kredietkaarten",
    "debt_to_income": "schuld/inkomen", "spend_to_income": "uitgaven/inkomen",
    "is_female": "geslacht (vrouw=1)",
}


def feature_label(name: str) -> str:
    if name in FEATURE_NL:
        return FEATURE_NL[name]
    for prefix, text in (("rec_", "maandelijkse uitgaven {}"), ("share_", "aandeel {} in uitgaven"),
                         ("chg_", "verandering uitgaven {}")):
        if name.startswith(prefix):
            return text.format(name[len(prefix):].replace("_", " "))
    return name


def format_feature_value(name: str, v: float) -> str:
    if v != v:                                              # NaN
        return "onbekend"
    if name.startswith("chg_") or name == "trend_3m":
        return f"{np.expm1(v):+.0%}"
    if name.startswith("share_"):
        return f"{v:.0%}"
    if name in ("debt_to_income", "spend_to_income", "last_vs_avg"):
        return f"{v:.2f}"
    return f"{v:,.0f}"


def explain_prediction(model, X_row: pd.DataFrame, feat_cols, background: pd.DataFrame, top=3):
    """SHAP-uitleg voor 1 klant en 1 productmodel. Waarden zijn in kans-eenheden
    (+0.05 = dit kenmerk verhoogt de kans met 5 procentpunt t.o.v. de achtergrondpopulatie).
    Geeft None als shap niet geinstalleerd is of niets oplevert."""
    try:
        import shap
    except ImportError:
        return None
    try:
        def f(A):
            return model.predict_proba(pd.DataFrame(A, columns=feat_cols))[:, 1]
        masker = shap.maskers.Independent(background[feat_cols].to_numpy(dtype=float),
                                          max_samples=len(background))
        explainer = shap.Explainer(f, masker, algorithm="permutation")
        sv = explainer(X_row[feat_cols].to_numpy(dtype=float), max_evals=2 * len(feat_cols) + 1)
        vals = np.asarray(sv.values)[0]
    except Exception as e:                                   # uitleg mag nooit de aanbeveling breken
        print(f"  ! SHAP mislukt: {e}")
        return None
    order = np.argsort(-np.abs(vals))[:top]
    return [dict(feature=feat_cols[i], label=feature_label(feat_cols[i]),
                 value=format_feature_value(feat_cols[i], float(X_row[feat_cols[i]].iloc[0])),
                 effect=float(vals[i])) for i in order if abs(vals[i]) > 1e-4]


def rank_products(X, models, feat_cols, prevalence, top_n=3,
                  min_lift=MIN_LIFT, min_prob=MIN_PROB, background=None) -> dict:
    """X = 1 rij met features. Rangschikt op lift (kans / gemiddelde kans) en laat producten
    weg met te lage lift of kans. Met background (DataFrame) wordt per aanbeveling een
    SHAP-uitleg toegevoegd. Geeft een dict met profiel, top-producten en geblokkeerde."""
    p = predict_proba(models, X[feat_cols], prevalence)[0]
    lift = np.array([p[j] / max(prevalence[k], 1e-6) for j, k in enumerate(PROD_KEYS)])
    dti = float(X["debt_to_income"].iloc[0])
    stressed = dti > DTI_LIMIT
    out = {"age": int(X["age"].iloc[0]), "yearly_income": float(X["yearly_income"].iloc[0]),
           "debt_to_income": dti, "stressed": stressed, "recommendations": [], "blocked": []}
    for j in np.argsort(-lift):
        if len(out["recommendations"]) >= top_n:
            break
        key = PROD_KEYS[j]
        cfg = PRODUCTS[key]
        if lift[j] < min_lift or p[j] < min_prob:
            continue
        if stressed and cfg["stress_block"]:
            out["blocked"].append(cfg["label"])
            continue
        chg = float(X[f"chg_{cfg['cat']}" if cfg["cat"] else "chg_total"].iloc[0])
        signal = np.expm1(chg * cfg["direction"]) if cfg["direction"] > 0 else np.expm1(-chg)
        if signal >= 0.2:
            verb = "gedaald" if cfg["direction"] < 0 else "gestegen"
            reason = (f"{cfg['reason']} {verb} met {signal:.0%} t.o.v. de "
                      f"{BASELINE - HISTORY} maanden ervoor")
        else:
            reason = (f"geen duidelijke recente verandering in {cfg['reason']}; "
                      f"score komt uit klantprofiel/seizoenspatroon")
        drivers = None
        if background is not None and models[key] is not None:
            drivers = explain_prediction(models[key], X, feat_cols, background)
        out["recommendations"].append(dict(
            product=key, label=cfg["label"], probability=float(p[j]),
            avg_probability=float(prevalence[key]), lift=float(lift[j]),
            reason=reason, drivers=drivers))
    return out


def print_ranking(title: str, out: dict) -> None:
    print(f"\n=== Aanbevelingen voor {title} ===")
    print(f"Leeftijd ~{out['age']}, jaarinkomen {out['yearly_income']:,.0f}, "
          f"schuld/inkomen {out['debt_to_income']:.2f}"
          f"{'  (financieel onder druk: kredietproducten geblokkeerd)' if out['stressed'] else ''}")
    for label in out["blocked"]:
        print(f"  [geblokkeerd] {label}  (geschiktheidsfilter: hoge schuldenlast)")
    if not out["recommendations"]:
        print(f"  Geen product met voldoende signaal (lift >= {MIN_LIFT}, kans >= {MIN_PROB:.0%}).")
    for n, r in enumerate(out["recommendations"], 1):
        print(f"  {n}. {r['label']}")
        print(f"     kans {r['probability']:.1%}  (gemiddelde klant: {r['avg_probability']:.1%}, "
              f"lift x{r['lift']:.1f})")
        if r.get("drivers"):
            print("     belangrijkste drivers (SHAP, in procentpunt kans):")
            for d in r["drivers"]:
                arrow = "verhoogt" if d["effect"] > 0 else "verlaagt"
                print(f"       - {d['label']} = {d['value']}: {arrow} met {abs(d['effect']) * 100:.1f} pp")
        else:
            print(f"     reden: {r['reason']}")


def recommend(client_id, models, arr, ntx, users, m0, feat_cols, prevalence, top_n=3,
              background=None):
    """Aanbeveling voor een klant uit de geladen CSV-data (peilmoment = einde van de data)."""
    matches = np.where(users["client_id"].to_numpy() == client_id)[0]
    if len(matches) == 0:
        sys.exit(f"Klant {client_id} niet gevonden (of geen transacties).")
    i = matches[0]
    t = arr.shape[1]
    X = make_features(t, arr, ntx, users, m0).iloc[[i]]
    out = rank_products(X, models, feat_cols, prevalence, top_n, background=background)
    print_ranking(f"klant {client_id}", out)
    return out


def find_demo_clients(models, arr, ntx, users, m0, feat_cols, prevalence, candidates, n=5):
    """Zoekt onder 'candidates' (client_ids) de klanten met de meeste bruikbare aanbevelingen
    op het einde van de data. Dit is een GESELECTEERD voorbeeld, geen representatieve klant."""
    t = arr.shape[1]
    X = make_features(t, arr, ntx, users, m0)
    ids = users["client_id"].to_numpy()
    keep = np.isin(ids, list(candidates)) & (X["rec_total"].to_numpy() > 0)
    X, ids = X[keep], ids[keep]
    P = predict_proba(models, X[feat_cols], prevalence)
    prev = np.array([max(prevalence[k], 1e-6) for k in PROD_KEYS])
    lift = P / prev
    ok = (lift >= MIN_LIFT) & (P >= MIN_PROB)
    stressed = (X["debt_to_income"].to_numpy() > DTI_LIMIT)[:, None]
    blocked = np.array([PRODUCTS[k]["stress_block"] for k in PROD_KEYS])[None, :]
    ok &= ~(stressed & blocked)
    n_ok = ok.sum(1)
    score = n_ok + 0.01 * np.where(ok, np.minimum(lift, 10), 0).sum(1)   # meeste producten, dan sterkste lift
    order = np.argsort(-score)[:n]
    print(f"\nBeste demo-klanten (onbekende klanten, meeste bruikbare aanbevelingen):")
    for r in order:
        prods = ", ".join(PRODUCTS[PROD_KEYS[j]]["label"].split(" /")[0] for j in np.where(ok[r])[0])
        print(f"  klant {ids[r]}: {n_ok[r]} aanbevelingen ({prods})")
    return [int(ids[r]) for r in order]


# --------------------------------------------------------------------------------------
# Opslaan, laden en nieuwe klanten scoren (zonder de CSV's)
# --------------------------------------------------------------------------------------
PROFILE_FIELDS = ["birth_year", "gender", "yearly_income", "per_capita_income",
                  "total_debt", "credit_score", "num_credit_cards"]


def label_config() -> dict:
    return dict(SPIKE=SPIKE, SAVE_DROP=SAVE_DROP, SAVE_MIN_BASE=SAVE_MIN_BASE,
                CREDIT_JUMP=CREDIT_JUMP, CREDIT_MIN_ABS=CREDIT_MIN_ABS,
                min_abs={k: c["min_abs"] for k, c in PRODUCTS.items()})


def save_bundle(path, models, feat_cols, prevalence, holdout_clients, background=None):
    joblib.dump({
        "models": models,
        "feat_cols": feat_cols,
        "prevalence": prevalence,
        "background": background,
        "holdout_clients": sorted(int(c) for c in holdout_clients),
        "config": dict(HISTORY=HISTORY, BASELINE=BASELINE, HORIZON=HORIZON, SPIKE=SPIKE,
                       DTI_LIMIT=DTI_LIMIT, CATS=CATS, LABELS=label_config()),
        "sklearn_version": sklearn.__version__,
    }, path)
    print(f"Modellen opgeslagen in {path}")


def load_bundle(path) -> dict:
    bundle = joblib.load(path)
    cfg = bundle["config"]
    if (cfg["HISTORY"], cfg["BASELINE"], cfg["CATS"]) != (HISTORY, BASELINE, CATS):
        raise ValueError("Opgeslagen modellen gebruiken andere HISTORY/BASELINE/categorieen "
                         "dan dit script; de features zouden niet kloppen.")
    if cfg.get("LABELS") != label_config():
        raise ValueError("Opgeslagen modellen zijn getraind met andere label-instellingen "
                         "(SPIKE/min_abs/SAVE_DROP/CREDIT_JUMP). Train opnieuw.")
    if bundle.get("sklearn_version") != sklearn.__version__:
        print(f"  ! waarschuwing: modellen getraind met scikit-learn "
              f"{bundle.get('sklearn_version')}, nu {sklearn.__version__}")
    return bundle


def score_new_client(bundle, transactions: pd.DataFrame, profile: dict,
                     cutoff: str | None = None, top_n: int = 3, use_shap: bool = True) -> dict:
    """Scoort 1 klant die niet in de CSV hoeft te zitten.

    transactions: DataFrame met kolommen date, amount, mcc (zelfde opmaak als de dataset).
    profile: dict met PROFILE_FIELDS (bedragen mogen strings zijn zoals "$29,000").
    cutoff: 'YYYY-MM' = eerste maand die NIET meer meetelt (alleen data ervoor wordt gebruikt).
            Standaard: de maand na de laatste transactie.
    """
    missing = [f for f in PROFILE_FIELDS if f not in profile]
    if missing:
        raise ValueError(f"profile mist velden: {missing}")
    tx = prepare_tx(transactions[["date", "amount", "mcc"]].copy())
    if tx.empty:
        raise ValueError("Geen uitgaven-transacties gevonden.")
    if cutoff is None:
        cutoff_abs = int(tx["month_abs"].max()) + 1
    else:
        y, m = cutoff.split("-")
        cutoff_abs = int(y) * 12 + int(m) - 1
    m0 = cutoff_abs - BASELINE
    tx = tx[(tx["month_abs"] >= m0) & (tx["month_abs"] < cutoff_abs)]
    if tx.empty:
        raise ValueError(f"Geen transacties in de {BASELINE} maanden voor de cutoff.")

    arr = np.zeros((1, BASELINE, len(CATS)), dtype=np.float32)
    ntx = np.zeros((1, BASELINE), dtype=np.float32)
    g = (tx.assign(mi=(tx["month_abs"] - m0).astype(int), ki=tx["cat"].map(CAT_IDX).astype(int))
           .groupby(["mi", "ki"])["amount"].agg(["sum", "size"]).reset_index())
    arr[0, g["mi"], g["ki"]] = g["sum"]
    np.add.at(ntx[0], g["mi"].to_numpy(), g["size"].to_numpy())

    users = pd.DataFrame([{f: profile[f] for f in PROFILE_FIELDS}])
    for col in ["yearly_income", "per_capita_income", "total_debt"]:
        users[col] = clean_money(users[col])
    X = make_features(BASELINE, arr, ntx, users, m0)
    out = rank_products(X, bundle["models"], bundle["feat_cols"], bundle["prevalence"], top_n,
                        background=bundle.get("background") if use_shap else None)
    out["months_with_data"] = int(tx["month_abs"].nunique())
    return out


# --------------------------------------------------------------------------------------
def main():
    global DTI_LIMIT
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, help="map met transactions_data.csv e.d.")
    ap.add_argument("--client", type=int, default=None, help="client_id voor aanbeveling")
    ap.add_argument("--max-clients", type=int, default=None, help="subset voor snelle test")
    ap.add_argument("--holdout", type=float, default=0.2,
                    help="fractie klanten die nooit in de training zitten")
    ap.add_argument("--save", default="next_product_models.joblib",
                    help="bestand waarin de getrainde modellen worden opgeslagen")
    ap.add_argument("--load", default=None,
                    help="laad eerder opgeslagen modellen i.p.v. opnieuw te trainen")
    ap.add_argument("--demo-top", type=int, default=0,
                    help="toon de N beste onbekende demo-klanten en gebruik de beste als demo")
    ap.add_argument("--dti-limit", type=float, default=None,
                    help=f"schuld/inkomen-grens voor kredietproducten (standaard {DTI_LIMIT})")
    ap.add_argument("--no-shap", action="store_true", help="geen SHAP-uitleg berekenen")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    if args.dti_limit is not None:
        DTI_LIMIT = args.dti_limit

    print("Data laden...")
    tx, users = load_data(args.data_dir, args.max_clients, args.seed)
    arr, ntx, users, m0 = build_tensors(tx, users)
    print(f"  {len(users)} klanten, {arr.shape[1]} maanden, {len(tx):,} uitgaven-transacties")
    dti_all = users["total_debt"] / (users["yearly_income"] + 1)
    q = dti_all.quantile([0.5, 0.75, 0.9])
    print(f"  schuld/inkomen: mediaan {q[0.5]:.2f}, 75% {q[0.75]:.2f}, 90% {q[0.9]:.2f}; "
          f"{(dti_all > DTI_LIMIT).mean():.0%} van de klanten zit boven de grens {DTI_LIMIT} "
          f"(kredietproducten geblokkeerd)")

    if args.load:
        bundle = load_bundle(args.load)
        models, feat_cols = bundle["models"], bundle["feat_cols"]
        prev_train, hold = bundle["prevalence"], set(bundle["holdout_clients"])
        background = bundle.get("background")
        if background is None and not args.no_shap:
            print("  (opgeslagen modellen bevatten geen SHAP-achtergrond; train opnieuw voor uitleg)")
        print(f"Modellen geladen uit {args.load} (training en evaluatie overgeslagen)")
    else:
        print("Dataset bouwen...")
        data = build_dataset(arr, ntx, users, m0)
        feat_cols = [c for c in data.columns
                     if not c.startswith("y_") and c not in ("t", "client_id")]
        print(f"  {len(data):,} (klant, peilmoment)-rijen, {len(feat_cols)} features")
        prevalence = {k: data[f"y_{k}"].mean() for k in PROD_KEYS}
        print("  Label-prevalentie (stel SPIKE / min_abs bij als dit extreem laag/hoog is):")
        for k in PROD_KEYS:
            flag = "   <-- buiten 2-30%, stel labels bij" if not 0.02 <= prevalence[k] <= 0.30 else ""
            print(f"    {k:<16}{prevalence[k]:.3f}{flag}")

        # Klant-holdout: deze klanten komen nooit in de training voor
        rng = np.random.default_rng(args.seed)
        all_clients = users["client_id"].to_numpy()
        n_hold = max(1, int(len(all_clients) * args.holdout))
        hold = set(rng.choice(all_clients, size=n_hold, replace=False))
        is_hold = data["client_id"].isin(hold)

        # Temporele split (laatste kwart van de peilmomenten)
        cutoffs = sorted(data["t"].unique())
        n_test = max(2, len(cutoffs) // 4)
        late = data["t"].isin(set(cutoffs[-n_test:]))

        train = data[~is_hold & ~late]          # bekende klanten, vroege periode
        test_seen = data[~is_hold & late]       # bekende klanten, latere periode
        test_unseen = data[is_hold & late]      # onbekende klanten, latere periode
        print(f"\nSplit: train {len(train):,} rijen ({len(all_clients) - n_hold} klanten), "
              f"test bekend {len(test_seen):,}, test onbekend {len(test_unseen):,} "
              f"({n_hold} klanten)")

        print("Modellen trainen...")
        models = train_models(train, feat_cols)
        prev_train = {k: train[f"y_{k}"].mean() for k in PROD_KEYS}
        background = train[feat_cols].sample(min(100, len(train)), random_state=args.seed)
        save_bundle(args.save, models, feat_cols, prev_train, hold, background)
        evaluate(models, test_seen, feat_cols, prev_train,
                 "Bekende klanten, latere periode")
        evaluate(models, test_unseen, feat_cols, prev_train,
                 "ONBEKENDE klanten, latere periode")

    if args.no_shap:
        background = None
    pool = sorted(hold & set(users["client_id"].to_numpy().tolist()))
    top_clients = []
    if args.demo_top and pool:
        top_clients = find_demo_clients(models, arr, ntx, users, m0, feat_cols, prev_train,
                                        pool, args.demo_top)
    client = args.client
    if client is None and top_clients:
        client = top_clients[0]
        print(f"\n(demo-klant {client}: geselecteerd voorbeeld, zat niet in de training)")
    elif client is None:
        if pool:
            client = int(np.random.default_rng(args.seed).choice(pool))
            print(f"\n(demo-klant {client} zat niet in de training)")
        else:
            client = int(np.random.default_rng(args.seed).choice(users["client_id"].to_numpy()))
            print(f"\n(demo-klant {client}; let op: kan in de training hebben gezeten)")
    recommend(client, models, arr, ntx, users, m0, feat_cols, prev_train, background=background)


if __name__ == "__main__":
    main()