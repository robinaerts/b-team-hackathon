import type { Recommendation, LifeStep, RecommendationCta, LoanProductId, RevenueModel, ShapDriver } from "./types";

export type ModelProductHit = {
  key: string;
  label: string;
  probability: number;
  prevalence: number;
  lift: number;
  blocked: boolean;
  reason: string;
  drivers?: ShapDriver[] | null;
};

type ProductMapping = {
  step: LifeStep;
  revenueModel: RevenueModel;
  title: string;
  body: (hit: ModelProductHit) => string;
  steps: string[];
  ctaLabel: string;
  cta: RecommendationCta;
  loanProduct?: LoanProductId;
};

const PRODUCT_MAP: Record<string, ProductMapping> = {
  reisverzekering: {
    step: "mobility",
    revenueModel: "verzekeren",
    title: "Reisverzekering",
    body: (h) =>
      `Reispatronen in je uitgaven — ${(h.probability * 100).toFixed(0)}% kans. ${h.reason}.`,
    steps: [
      "Sluit een reisverzekering af via KBC Verzekeringen",
      "Check dekking voor annulatie en medische kosten",
      "Verdien Kate Coins bij partners",
    ],
    ctaLabel: "Reisverzekering",
    cta: "insure",
  },
  woonkrediet: {
    step: "mortgage",
    revenueModel: "lenen",
    title: "Woon- of verbouwkrediet",
    body: (h) =>
      `Woonuitgaven stijgen — ${(h.probability * 100).toFixed(0)}% kans op woonkrediet. ${h.reason}.`,
    steps: [
      "Simuleer een hypothecaire of renovatielening",
      "Bekijk MyHome voor zoekopdrachten",
      "Voeg brand- en schuldsaldoverzekering toe",
    ],
    ctaLabel: "Lening starten",
    cta: "loan",
    loanProduct: "hypotheek",
  },
  autolening: {
    step: "car_loan",
    revenueModel: "lenen",
    title: "Autolening of -verzekering",
    body: (h) =>
      `Auto-uitgaven vallen op (${(h.probability * 100).toFixed(0)}%). ${h.reason}.`,
    steps: [
      "Start een autolening (benzine, hybride of elektrisch)",
      "Vergelijk je autoverzekering",
      "Betaal tankbeurten via KBC Mobile",
    ],
    ctaLabel: "Autolening starten",
    cta: "loan",
    loanProduct: "auto",
  },
  hospitalisatie: {
    step: "insure_family",
    revenueModel: "verzekeren",
    title: "Hospitalisatieverzekering",
    body: (h) =>
      `Zorguitgaven wijzen op hospitalisatie (${(h.probability * 100).toFixed(0)}%). ${h.reason}.`,
    steps: [
      "Bekijk hospitalisatieverzekering",
      "Check familiale verzekering",
      "Vraag Kate om een offerte",
    ],
    ctaLabel: "Verzekering starten",
    cta: "insure",
  },
  sparen: {
    step: "save",
    revenueModel: "sparen",
    title: "Sparen of beleggen",
    body: (h) =>
      `Ruimte om te sparen (${(h.probability * 100).toFixed(0)}%). ${h.reason}.`,
    steps: [
      "Verhoog stortingen op je spaarrekening",
      "Start pensioensparen of tak 21/23",
      "Of begin een beleggingsplan",
    ],
    ctaLabel: "Sparen bekijken",
    cta: "save",
  },
  kredietkaart: {
    step: "general",
    revenueModel: "betalen",
    title: "Kredietkaart of hogere limiet",
    body: (h) =>
      `Bestedingspatroon past bij een kredietkaart (${(h.probability * 100).toFixed(0)}%). ${h.reason}.`,
    steps: [
      "Bekijk KBC-kredietkaarten in Aanbod",
      "Pas je limiet aan indien nodig",
      "Volg uitgaven in Mijn KBC",
    ],
    ctaLabel: "Bekijk kaarten",
    cta: "none",
  },
};

export function mapModelHitToRecommendation(
  hit: ModelProductHit,
  evidence: string[],
): Recommendation {
  const map = PRODUCT_MAP[hit.key] ?? {
    step: "general" as LifeStep,
    revenueModel: "betalen" as RevenueModel,
    title: hit.label,
    body: () => hit.reason,
    steps: ["Vraag Kate om meer uitleg", "Bekijk Aanbod"],
    ctaLabel: "Vraag Kate",
    cta: "none" as RecommendationCta,
  };

  return {
    id: `model-${hit.key}`,
    step: map.step,
    revenueModel: map.revenueModel,
    title: map.title,
    body: map.body(hit),
    steps: map.steps,
    ctaLabel: map.ctaLabel,
    cta: map.cta,
    loanProduct: map.loanProduct,
    evidence: evidence.length ? evidence : [hit.reason],
    modelProbability: hit.probability,
    modelLift: hit.lift,
    modelSource: "model.joblib",
    shapDrivers: hit.drivers ?? undefined,
    shapReason: hit.reason,
  };
}
