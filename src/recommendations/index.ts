import type { Transaction } from "../data/transactions";
import { mapModelHitToRecommendation, type ModelProductHit } from "./modelMap";
import { recommendLifeStep } from "./rulesEngine";
import type { Recommendation, RecommendFn } from "./types";

export type {
  Recommendation,
  RecommendFn,
  LifeStep,
  RecommendationCta,
  RevenueModel,
  LoanProductId,
  ShapDriver,
} from "./types";
export { LOAN_PRODUCTS, REVENUE_LABELS, monthlyPayment, formatEuro, formatEuroExact } from "./products";
export type { LoanProduct } from "./products";

const DEMO_PROFILE = {
  age: 32,
  yearly_income: 42000,
  per_capita_income: 42000,
  total_debt: 8500,
  credit_score: 725,
  num_credit_cards: 1,
  is_female: 0,
};

/**
 * Sync fallback (rules) — used if the model API is offline.
 */
export function getRecommendation(txs: Transaction[]): Recommendation {
  const engine: RecommendFn = recommendLifeStep;
  const rec = engine(txs);
  return { ...rec, modelSource: "rules" };
}

type ApiResponse = {
  source: string;
  top: ModelProductHit[];
  evidence: string[];
  shap?: boolean;
};

/**
 * Async path: call FastAPI which loads src/model.joblib (+ SHAP).
 * Falls back to rulesEngine on network/API errors.
 */
export async function fetchRecommendation(
  txs: Transaction[],
  questionnaireFeatures?: Record<string, string | number | boolean>,
): Promise<Recommendation[]> {
  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: txs,
        profile: DEMO_PROFILE,
        questionnaire: questionnaireFeatures ?? {},
        top_n: 3,
        use_shap: true,
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = (await res.json()) as ApiResponse;
    const top = data.top ?? [];
    if (!top.length) throw new Error("empty top");
    return top.map((hit) => mapModelHitToRecommendation(hit, data.evidence ?? []));
  } catch {
    return [getRecommendation(txs)];
  }
}
