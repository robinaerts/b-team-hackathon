/** Interactive kAIte questionnaires — signals, preferences, pulse. */

export type QuestionKind = "signal" | "preference" | "pulse";

export type QuestionAction =
  | { type: "flow"; flow: "loan" | "insure" | "save" | "mobility"; product?: string; message?: string }
  | { type: "hub"; hub: "myhome"; message?: string }
  | { type: "tab"; tab: "beleggen" | "mijnkbc" | "aanbod" | "zakelijk"; message?: string }
  | { type: "notify"; message: string }
  | { type: "freeze"; message?: string }
  | { type: "support"; message?: string };

export type QuestionChip = {
  id: string;
  label: string;
  action: QuestionAction;
};

export type Questionnaire = {
  id: string;
  kind: QuestionKind;
  signal?: string;
  question: string;
  subtitle?: string;
  chips: QuestionChip[];
};

/** 1. Signal-triggered questions */
export const SIGNAL_QUESTIONS: Questionnaire[] = [
  {
    id: "sig-notary",
    kind: "signal",
    signal: "Payment to a notary",
    question: "Buying a home? 🏠",
    subtitle: "We can estimate borrowing power and check home insurance.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: {
          type: "flow",
          flow: "loan",
          product: "hypotheek",
          message: "Opening borrowing estimate + home insurance checklist",
        },
      },
      {
        id: "no",
        label: "No",
        action: { type: "hub", hub: "myhome", message: "Exploring MyHome tips instead" },
      },
      {
        id: "later",
        label: "Not now",
        action: { type: "tab", tab: "aanbod", message: "Browse home products in Aanbod" },
      },
    ],
  },
  {
    id: "sig-raise",
    kind: "signal",
    signal: "Salary went up",
    question: "Nice raise! Save some?",
    subtitle: "Set an automatic monthly transfer from your current account.",
    chips: [
      {
        id: "10",
        label: "10%",
        action: { type: "flow", flow: "save", message: "Setting up 10% automatic monthly transfer" },
      },
      {
        id: "20",
        label: "20%",
        action: { type: "flow", flow: "save", message: "Setting up 20% automatic monthly transfer" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "tab", tab: "beleggen", message: "Or grow your raise with investing" },
      },
    ],
  },
  {
    id: "sig-rent",
    kind: "signal",
    signal: "Rent to a new landlord",
    question: "Moved recently?",
    subtitle: "Update your address and review home insurance.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "insure", message: "Address update + home insurance check" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "tab", tab: "mijnkbc", message: "Review your contact details in Mijn KBC" },
      },
    ],
  },
  {
    id: "sig-baby",
    kind: "signal",
    signal: "Baby or childcare shops",
    question: "Change at home?",
    subtitle: "We can set up a family budget and child savings.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "save", message: "Family budget + child savings account" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "flow", flow: "insure", message: "Review family / hospitalisatie cover" },
      },
      {
        id: "private",
        label: "Rather not say",
        action: { type: "tab", tab: "aanbod", message: "Privacy respected — see family products anytime" },
      },
    ],
  },
  {
    id: "sig-flight",
    kind: "signal",
    signal: "Airline booking",
    question: "Traveling soon? ✈️",
    subtitle: "Check travel cover and enable your card abroad.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "insure", message: "Card travel cover + abroad payments" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "flow", flow: "mobility", message: "Keep tickets & parking handy in Mobile" },
      },
    ],
  },
  {
    id: "sig-car",
    kind: "signal",
    signal: "Car dealer payment",
    question: "New car? 🚗",
    subtitle: "Compare car insurance or finance the purchase.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "insure", message: "Opening car insurance comparison" },
      },
      {
        id: "no",
        label: "No",
        action: {
          type: "flow",
          flow: "loan",
          product: "auto",
          message: "Explore an autolening if you need financing later",
        },
      },
    ],
  },
  {
    id: "sig-tuition",
    kind: "signal",
    signal: "Tuition fee",
    question: "Starting studies? 🎓",
    subtitle: "Student account and a budget template help you stay on track.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "save", message: "Student account + budget template" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "tab", tab: "aanbod", message: "See education & youth products in Aanbod" },
      },
    ],
  },
  {
    id: "sig-pension",
    kind: "signal",
    signal: "Pension deposit",
    question: "Retired? 🎉",
    subtitle: "Build a clear retirement income plan.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "save", message: "Opening retirement income plan" },
      },
      {
        id: "not-yet",
        label: "Not yet",
        action: { type: "tab", tab: "beleggen", message: "Keep building with pensioensparen / beleggen" },
      },
    ],
  },
  {
    id: "sig-fraud",
    kind: "signal",
    signal: "Unusual large transfer",
    question: "Was this you?",
    subtitle: "Security check on a large outgoing payment.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "tab", tab: "mijnkbc", message: "Confirmed — review recent payments in Mijn KBC" },
      },
      {
        id: "no",
        label: "No!",
        action: { type: "freeze", message: "Transfer frozen · calling you via KBC Live" },
      },
    ],
  },
  {
    id: "sig-salary-missing",
    kind: "signal",
    signal: "Salary didn't arrive",
    question: "All OK this month?",
    subtitle: "We noticed your usual salary hasn't landed yet.",
    chips: [
      {
        id: "fine",
        label: "Fine",
        action: { type: "flow", flow: "save", message: "Good — check your buffer for this month" },
      },
      {
        id: "new-job",
        label: "New job",
        action: { type: "tab", tab: "mijnkbc", message: "Update employer details in Mijn KBC" },
      },
      {
        id: "help",
        label: "Need help",
        action: { type: "support", message: "Quiet support route opened" },
      },
    ],
  },
  {
    id: "sig-low-balance",
    kind: "signal",
    signal: "Low balance forecast",
    question: "Tight month ahead. Move €200?",
    subtitle: "Transfer from savings to stay comfortable.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "save", message: "€200 moved from savings to current account" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "tab", tab: "beleggen", message: "Review cash vs investments instead" },
      },
    ],
  },
  {
    id: "sig-subscription",
    kind: "signal",
    signal: "Unused subscription",
    question: "Still using this?",
    subtitle: "Spotify looks unused — cancel to save ~€18/month.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "mobility", message: "Keep it — earn Kate Coins on partners" },
      },
      {
        id: "cancel",
        label: "Cancel it",
        action: { type: "tab", tab: "mijnkbc", message: "Cancel steps + money saved overview" },
      },
    ],
  },
];

/** 2. Once-only preferences */
export const PREFERENCE_QUESTIONS: Questionnaire[] = [
  {
    id: "pref-goal",
    kind: "preference",
    question: "Your #1 money goal?",
    subtitle: "kAIte will prioritise tips around this.",
    chips: [
      {
        id: "home",
        label: "🏠 Home",
        action: { type: "hub", hub: "myhome", message: "Focus: home — opening MyHome" },
      },
      {
        id: "buffer",
        label: "🛟 Buffer",
        action: { type: "flow", flow: "save", message: "Focus: buffer — let's grow your savings" },
      },
      {
        id: "grow",
        label: "📈 Grow",
        action: { type: "tab", tab: "beleggen", message: "Focus: grow — opening Beleggen" },
      },
      {
        id: "kids",
        label: "🎓 Kids",
        action: { type: "flow", flow: "save", message: "Focus: kids — child savings options" },
      },
      {
        id: "retire",
        label: "🌴 Retire",
        action: { type: "flow", flow: "save", message: "Focus: retire — pensioensparen" },
      },
    ],
  },
  {
    id: "pref-guidance",
    kind: "preference",
    question: "How should we guide you?",
    subtitle: "Choose how proactive kAIte should be.",
    chips: [
      {
        id: "do",
        label: "Do it for me",
        action: { type: "tab", tab: "aanbod", message: "We'll prepare ready-to-sign actions in Aanbod" },
      },
      {
        id: "suggest",
        label: "Suggest",
        action: { type: "hub", hub: "myhome", message: "Suggestions on — see tailored MyHome tips" },
      },
      {
        id: "inform",
        label: "Just inform",
        action: { type: "tab", tab: "mijnkbc", message: "Info mode — overview in Mijn KBC" },
      },
    ],
  },
  {
    id: "pref-contact",
    kind: "preference",
    question: "Hear from us…",
    subtitle: "How often should Kate reach out?",
    chips: [
      {
        id: "urgent",
        label: "Only urgent",
        action: { type: "tab", tab: "mijnkbc", message: "Alerts limited to urgent — review notification settings" },
      },
      {
        id: "weekly",
        label: "Weekly",
        action: { type: "tab", tab: "aanbod", message: "Weekly digest on — peek this week's Aanbod" },
      },
      {
        id: "anytime",
        label: "Anytime",
        action: { type: "flow", flow: "mobility", message: "Full Kate tips on — including Kate Coins" },
      },
    ],
  },
  {
    id: "pref-esg",
    kind: "preference",
    question: "Invest sustainably?",
    subtitle: "Shape how we suggest funds and plans.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "tab", tab: "beleggen", message: "Sustainable funds highlighted in Beleggen" },
      },
      {
        id: "neutral",
        label: "Doesn't matter",
        action: { type: "tab", tab: "beleggen", message: "Showing all investment options" },
      },
    ],
  },
];

/** 3. Weekly pulse */
export const PULSE_QUESTIONS: Questionnaire[] = [
  {
    id: "pulse-mood",
    kind: "pulse",
    question: "Money this week?",
    subtitle: "Quick pulse for kAIte's trend model.",
    chips: [
      {
        id: "bad",
        label: "☹️",
        action: { type: "flow", flow: "save", message: "Tough week — let's check your buffer" },
      },
      {
        id: "ok",
        label: "😐",
        action: { type: "tab", tab: "mijnkbc", message: "Steady — review balances in Mijn KBC" },
      },
      {
        id: "good",
        label: "🙂",
        action: { type: "tab", tab: "beleggen", message: "Great week — room to invest?" },
      },
    ],
  },
  {
    id: "pulse-expense",
    kind: "pulse",
    question: "Big expense coming?",
    subtitle: "We'll prepare cash or credit options.",
    chips: [
      {
        id: "yes",
        label: "Yes",
        action: { type: "flow", flow: "loan", product: "renovatie", message: "Preparing financing options" },
      },
      {
        id: "no",
        label: "No",
        action: { type: "flow", flow: "save", message: "Keep building your buffer then" },
      },
    ],
  },
  {
    id: "pulse-tip",
    kind: "pulse",
    question: "Was this tip useful?",
    subtitle: "Helps kAIte learn what to show next.",
    chips: [
      {
        id: "up",
        label: "👍",
        action: { type: "tab", tab: "aanbod", message: "Glad it helped — more ideas in Aanbod" },
      },
      {
        id: "down",
        label: "👎",
        action: { type: "hub", hub: "myhome", message: "Thanks — we'll tune tips. Try MyHome?" },
      },
    ],
  },
];

export type StoredAnswer = {
  questionId: string;
  kind: QuestionKind;
  chipId: string;
  label: string;
  answeredAt: string;
  signal?: string;
};

export type QuestionnaireStore = {
  answers: StoredAnswer[];
  prefsAsked: string[];
  sessionCount: number;
  lastPulseWeek?: string;
  lastPulseId?: string;
  dismissedSignals: string[];
};

const STORAGE_KEY = "kaite-questionnaires-v1";

export function loadQuestionnaireStore(): QuestionnaireStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as QuestionnaireStore;
  } catch {
    /* ignore */
  }
  return {
    answers: [],
    prefsAsked: [],
    sessionCount: 0,
    dismissedSignals: [],
  };
}

export function saveQuestionnaireStore(store: QuestionnaireStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function answersToModelFeatures(answers: StoredAnswer[]): Record<string, string | number | boolean> {
  const byId = Object.fromEntries(answers.map((a) => [a.questionId, a]));
  const feat: Record<string, string | number | boolean> = {};

  if (byId["pref-goal"]) feat.money_goal = byId["pref-goal"].chipId;
  if (byId["pref-guidance"]) feat.guidance_style = byId["pref-guidance"].chipId;
  if (byId["pref-contact"]) feat.contact_pref = byId["pref-contact"].chipId;
  if (byId["pref-esg"]) feat.sustainable_invest = byId["pref-esg"].chipId === "yes";

  const pulses = answers.filter((a) => a.kind === "pulse");
  const lastMood = [...pulses].reverse().find((a) => a.questionId === "pulse-mood");
  if (lastMood) feat.pulse_mood = lastMood.chipId;
  const lastExp = [...pulses].reverse().find((a) => a.questionId === "pulse-expense");
  if (lastExp) feat.big_expense_coming = lastExp.chipId === "yes";
  const lastTip = [...pulses].reverse().find((a) => a.questionId === "pulse-tip");
  if (lastTip) feat.tip_useful = lastTip.chipId === "up";

  if (byId["sig-notary"]?.chipId === "yes") feat.intent_buy_home = true;
  if (byId["sig-car"]?.chipId === "yes") feat.intent_new_car = true;
  if (byId["sig-flight"]?.chipId === "yes") feat.intent_travel = true;
  if (byId["sig-baby"]?.chipId === "yes") feat.intent_family = true;
  if (byId["sig-raise"]) {
    feat.save_raise_pct =
      byId["sig-raise"].chipId === "10" ? 10 : byId["sig-raise"].chipId === "20" ? 20 : 0;
  }

  feat.n_answers = answers.length;
  return feat;
}
