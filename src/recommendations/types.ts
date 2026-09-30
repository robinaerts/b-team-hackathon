import type { Transaction } from "../data/transactions";

/** KBC verdienmodellen (particulieren + ondernemers). */
export type RevenueModel =
  | "betalen"
  | "sparen"
  | "beleggen"
  | "lenen"
  | "verzekeren"
  | "mobiliteit"
  | "zakelijk";

export type LifeStep =
  | "buy_home"
  | "mortgage"
  | "bridge_loan"
  | "energy_loan"
  | "car_loan"
  | "bike_loan"
  | "renovate"
  | "save"
  | "pension"
  | "invest"
  | "insure_home"
  | "insure_car"
  | "insure_family"
  | "mobility"
  | "kate_coins"
  | "business"
  | "general";

export type RecommendationCta =
  | "myhome"
  | "beleggen"
  | "zakelijk"
  | "loan"
  | "insure"
  | "save"
  | "mobility"
  | "none";

export type LoanProductId =
  | "hypotheek"
  | "overbrugging"
  | "energie"
  | "renovatie"
  | "auto"
  | "fiets"
  | "moto"
  | "camper"
  | "boot";

/** SHAP feature contribution for one product score. */
export type ShapDriver = {
  feature: string;
  label: string;
  value: string;
  /** Change in probability vs background (e.g. +0.05 = +5 pp). */
  effect: number;
};

export type Recommendation = {
  id: string;
  step: LifeStep;
  revenueModel: RevenueModel;
  title: string;
  body: string;
  steps: string[];
  ctaLabel: string;
  cta: RecommendationCta;
  /** Prefill for loan flow when cta === "loan" */
  loanProduct?: LoanProductId;
  evidence: string[];
  /** Optional scores from model.joblib */
  modelProbability?: number;
  modelLift?: number;
  modelSource?: "model.joblib" | "rules";
  /** Top SHAP drivers explaining this product score */
  shapDrivers?: ShapDriver[];
  shapReason?: string;
};

export type RecommendFn = (txs: Transaction[]) => Recommendation;
