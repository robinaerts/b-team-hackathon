import type { Transaction } from "../data/transactions";
import {
  PULSE_QUESTIONS,
  PREFERENCE_QUESTIONS,
  SIGNAL_QUESTIONS,
  type Questionnaire,
  type QuestionnaireStore,
} from "./catalog";

type SignalId =
  | "sig-notary"
  | "sig-raise"
  | "sig-rent"
  | "sig-baby"
  | "sig-flight"
  | "sig-car"
  | "sig-tuition"
  | "sig-pension"
  | "sig-fraud"
  | "sig-salary-missing"
  | "sig-low-balance"
  | "sig-subscription";

function hay(tx: Transaction) {
  return `${tx.merchant} ${tx.category}`.toLowerCase();
}

/** Detect which life signals are active from recent transactions. */
export function detectSignals(txs: Transaction[]): SignalId[] {
  const hits: SignalId[] = [];
  const merchants = txs.map(hay);
  const has = (hint: string) => merchants.some((m) => m.includes(hint));

  if (has("notaris") || (has("immoweb") && has("notaris"))) hits.push("sig-notary");
  if (txs.some((t) => t.category === "income" && t.amount >= 2500)) hits.push("sig-raise");
  if (has("huur") || has("landlord") || (has("huurgeld") && has("kot"))) hits.push("sig-rent");
  if (has("baby") || has("kraam") || has("prenatal") || has("zeeman baby")) hits.push("sig-baby");
  if (has("ryanair") || has("brussels airlines") || has("airline") || has("booking.com")) {
    hits.push("sig-flight");
  }
  if (has("garage") || has("autohuis") || has("car dealer") || has("bmw") || has("audi dealer")) {
    hits.push("sig-car");
  }
  if (has("tuition") || has("inschrijvingsgeld") || has("kuleuven") || has("hogeschool")) {
    hits.push("sig-tuition");
  }
  if (has("pensioen") || has("pension")) hits.push("sig-pension");
  if (txs.some((t) => t.amount < -2000)) hits.push("sig-fraud");
  if (has("salary missing") || has("loon ontbreekt")) hits.push("sig-salary-missing");
  if (has("spaarrekening") && txs.some((t) => t.category === "groceries")) {
    hits.push("sig-low-balance");
  }
  if (has("spotify") || has("netflix") || has("disney")) hits.push("sig-subscription");

  return hits;
}

const ALL_QUESTIONS: Questionnaire[] = [
  ...SIGNAL_QUESTIONS,
  ...PREFERENCE_QUESTIONS,
  ...PULSE_QUESTIONS,
];

/**
 * Every app start: pick one random question from the catalog.
 */
export function pickQuestionnaire(
  _txs: Transaction[],
  _store: QuestionnaireStore,
): Questionnaire | null {
  if (ALL_QUESTIONS.length === 0) return null;
  const i = Math.floor(Math.random() * ALL_QUESTIONS.length);
  return ALL_QUESTIONS[i] ?? null;
}
