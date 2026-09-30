import type { Transaction } from "../data/transactions";
import {
  PULSE_QUESTIONS,
  PREFERENCE_QUESTIONS,
  SIGNAL_QUESTIONS,
  isoWeekKey,
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
  // Demo: treat a large salary as a "raise" signal when income ≥ 2500
  if (txs.some((t) => t.category === "income" && t.amount >= 2500)) hits.push("sig-raise");
  if (has("huur") || has("landlord") || (has("huurgeld") && has("kot"))) hits.push("sig-rent");
  if (has("baby") || has("kraam") || has("prenatal") || has("zeeman baby")) hits.push("sig-baby");
  if (has("ryanair") || has("brussels airlines") || has("airline") || has("booking.com")) {
    hits.push("sig-flight");
  }
  if (has("garage") || has("autohuis") || has("car dealer") || has("bmw") || has("audi dealer")) {
    hits.push("sig-car");
  }
  // Soft car signal from heavy car spend for demo
  if (!hits.includes("sig-car") && txs.filter((t) => t.category === "car").length >= 1 && has("shell")) {
    // don't force car dealer question from carwash alone
  }
  if (has("tuition") || has("inschrijvingsgeld") || has("kuleuven") || has("hogeschool")) {
    hits.push("sig-tuition");
  }
  if (has("pensioen") || has("pension")) hits.push("sig-pension");

  // Unusual large transfer: single expense > 2000 (demo threshold)
  if (txs.some((t) => t.amount < -2000)) hits.push("sig-fraud");

  // Salary missing: no income in list (demo flag via empty — we always have salary)
  // Toggle via merchant tag
  if (has("salary missing") || has("loon ontbreekt")) hits.push("sig-salary-missing");

  // Low balance: demo when balance-like savings transfer present & groceries
  if (has("spaarrekening") && txs.some((t) => t.category === "groceries")) {
    hits.push("sig-low-balance");
  }

  if (has("spotify") || has("netflix") || has("disney")) hits.push("sig-subscription");

  return hits;
}

/**
 * Pick at most one question for this app open.
 * Priority: unanswered signal → weekly pulse → next preference.
 */
export function pickQuestionnaire(
  txs: Transaction[],
  store: QuestionnaireStore,
): Questionnaire | null {
  const answered = new Set(store.answers.map((a) => a.questionId));
  const signals = detectSignals(txs);

  for (const sigId of signals) {
    if (store.dismissedSignals.includes(sigId)) continue;
    if (answered.has(sigId)) continue;
    const q = SIGNAL_QUESTIONS.find((s) => s.id === sigId);
    if (q) return q;
  }

  const week = isoWeekKey();
  if (store.lastPulseWeek !== week) {
    // Rotate pulse questions by week number
    const weekNum = parseInt(week.split("W")[1] ?? "1", 10);
    const pulse = PULSE_QUESTIONS[weekNum % PULSE_QUESTIONS.length];
    if (pulse && store.lastPulseId !== pulse.id) return pulse;
    // If same id somehow, still show if week changed
    if (pulse) return pulse;
  }

  // One preference per session until all answered
  const nextPref = PREFERENCE_QUESTIONS.find(
    (p) => !answered.has(p.id) && !store.prefsAsked.includes(p.id),
  );
  if (nextPref && store.sessionCount > 0) {
    // Show first preference from session 1; stagger: sessionCount prefs max this open = 1
    return nextPref;
  }
  // First open: still ask first preference if nothing else
  if (nextPref) return nextPref;

  return null;
}
