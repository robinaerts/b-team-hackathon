import type { Transaction } from "../data/transactions";
import type { LifeStep, RecommendFn, Recommendation } from "./types";

const HOME = ["immoweb", "notaris", "huur", "kot", "ikea", "meubel", "woon"];
const ENERGY = ["fluvius", "energie", "isolatie", "brico", "warmtepomp", "zonne"];
const CAR = ["shell", "q8", "total", "carwash", "garage", "autokeuring"];
const BIKE = ["bike", "fiets", "decathlon"];
const MOBILITY = ["nmbs", "de lijn", "mivb", "4411", "parking", "q-park", "vignette"];
const SAVE = ["spaar", "pensioen"];
const INVEST = ["bolero", "belegg", "fondsen"];
const HEALTH = ["uz ", "ziekenhuis", "apotheek", "mutualiteit"];
const BUSINESS = ["vzw", "btw", "factuur zakelijk", "bancontact pro"];

function hay(tx: Transaction) {
  return `${tx.merchant} ${tx.category}`.toLowerCase();
}

function match(tx: Transaction, hints: string[]) {
  const h = hay(tx);
  return hints.some((x) => h.includes(x));
}

function evidence(txs: Transaction[], hints: string[]) {
  return txs.filter((t) => match(t, hints)).map((t) => t.merchant);
}

function cat(txs: Transaction[], ...cats: string[]) {
  return txs.filter((t) => cats.includes(t.category));
}

/**
 * Heuristic stand-in covering KBC verdienmodellen.
 * Replace via getRecommendation() when the decision tree arrives.
 */
export const recommendLifeStep: RecommendFn = (txs) => {
  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const savingsRate = income > 0 ? Math.max(0, (income - outflow) / income) : 0;

  const homeN = cat(txs, "housing", "rent", "furniture").length + txs.filter((t) => match(t, HOME)).length;
  const energyN = cat(txs, "energy", "renovation").length + txs.filter((t) => match(t, ENERGY)).length;
  const carN = cat(txs, "car").length + txs.filter((t) => match(t, CAR)).length;
  const bikeN = cat(txs, "bike").length + txs.filter((t) => match(t, BIKE)).length;
  const mobN = cat(txs, "mobility", "parking").length + txs.filter((t) => match(t, MOBILITY)).length;
  const saveN = cat(txs, "savings").length + txs.filter((t) => match(t, SAVE)).length;
  const invN = txs.filter((t) => match(t, INVEST)).length;
  const healthN = cat(txs, "health").length + txs.filter((t) => match(t, HEALTH)).length;
  const bizN = txs.filter((t) => match(t, BUSINESS)).length;

  const scores: Partial<Record<LifeStep, number>> = {
    buy_home: homeN * 2.5 + (cat(txs, "rent").length ? 2 : 0),
    mortgage: homeN >= 3 ? homeN * 2 : 0,
    energy_loan: energyN * 3.5,
    renovate: energyN * 2,
    car_loan: carN * 3,
    bike_loan: bikeN * 4,
    save: saveN * 2 + (savingsRate > 0.1 ? 2 : 0),
    pension: saveN >= 1 && income > 2000 ? 2.5 : 0,
    invest: invN * 3 + (savingsRate > 0.15 ? 3 : 0) + (income > 2500 ? 1 : 0),
    insure_home: homeN >= 2 ? 2 : 0,
    insure_car: carN >= 2 ? 3 : 0,
    insure_family: healthN * 2.5,
    mobility: mobN * 2.5,
    kate_coins: mobN + carN > 2 ? 1.5 : 0.8,
    business: bizN * 4,
    general: 0.4,
  };

  const step = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "general") as LifeStep;

  const catalog: Record<LifeStep, Recommendation> = {
    buy_home: {
      id: "rec-buy-home",
      step: "buy_home",
      revenueModel: "lenen",
      title: "Klaar voor een woning?",
      body: "Huur, Immoweb en notaris duiken op — tijd om MyHome en een hypotheek te verkennen.",
      steps: [
        "Simuleer je hypothecaire lening",
        "Bekijk zoekopdrachten in MyHome",
        "Voeg een brand- en schuldsaldoverzekering toe",
      ],
      ctaLabel: "Start woontraject",
      cta: "loan",
      loanProduct: "hypotheek",
      evidence: evidence(txs, HOME).slice(0, 4),
    },
    mortgage: {
      id: "rec-mortgage",
      step: "mortgage",
      revenueModel: "lenen",
      title: "Hypothecaire lening aanvragen",
      body: "Je woonuitgaven passen bij een KBC-hypotheek — inclusief overbrugging indien nodig.",
      steps: [
        "Kies looptijd en leenbedrag",
        "Bekijk maandlasten en rente",
        "Koppel schuldsaldoverzekering",
      ],
      ctaLabel: "Hypotheek starten",
      cta: "loan",
      loanProduct: "hypotheek",
      evidence: evidence(txs, HOME).slice(0, 4),
    },
    bridge_loan: {
      id: "rec-bridge",
      step: "bridge_loan",
      revenueModel: "lenen",
      title: "Overbruggingskrediet?",
      body: "Bij aankoop vóór verkoop overbrugt KBC het verschil tijdelijk.",
      steps: ["Schat overbruggingsbedrag", "Kies korte looptijd", "Combineer met hypotheek"],
      ctaLabel: "Overbrugging starten",
      cta: "loan",
      loanProduct: "overbrugging",
      evidence: evidence(txs, HOME).slice(0, 3),
    },
    energy_loan: {
      id: "rec-energy",
      step: "energy_loan",
      revenueModel: "lenen",
      title: "Energielening voor je woning",
      body: "Energie- en isolatiekosten vallen op — een KBC-energielening maakt verduurzaming haalbaar.",
      steps: [
        "Bereken je renovatiekost",
        "Simuleer een energielening",
        "Check premies via Kate",
      ],
      ctaLabel: "Energielening starten",
      cta: "loan",
      loanProduct: "energie",
      evidence: evidence(txs, ENERGY).slice(0, 4),
    },
    renovate: {
      id: "rec-renovate",
      step: "renovate",
      revenueModel: "lenen",
      title: "Renovatielening overwegen",
      body: "Verbouwingsuitgaven suggereren een renovatielening naast je brandverzekering.",
      steps: ["Kies renovatiebedrag", "Plan werken in MyHome", "Update brandverzekering"],
      ctaLabel: "Renovatie lenen",
      cta: "loan",
      loanProduct: "renovatie",
      evidence: evidence(txs, ENERGY).slice(0, 4),
    },
    car_loan: {
      id: "rec-car",
      step: "car_loan",
      revenueModel: "lenen",
      title: "Autolening op maat",
      body: "Brandstof- en wagenkosten suggereren een KBC-autolening (benzine, hybride of elektrisch).",
      steps: ["Kies leenbedrag en looptijd", "Voeg autoverzekering toe", "Betaal tankbeurten via KBC Mobile"],
      ctaLabel: "Autolening starten",
      cta: "loan",
      loanProduct: "auto",
      evidence: evidence(txs, CAR).slice(0, 4),
    },
    bike_loan: {
      id: "rec-bike",
      step: "bike_loan",
      revenueModel: "lenen",
      title: "Fietslening voor je e-bike",
      body: "Fietsuitgaven? Financier (elektrische) fietsen voordelig via KBC.",
      steps: ["Kies fietslening", "Verdien Kate Coins bij partners", "Combineer met NMBS/De Lijn tickets"],
      ctaLabel: "Fietslening starten",
      cta: "loan",
      loanProduct: "fiets",
      evidence: evidence(txs, BIKE).slice(0, 4),
    },
    save: {
      id: "rec-save",
      step: "save",
      revenueModel: "sparen",
      title: "Slimmer sparen",
      body: "Je stort al naar sparen — optimaliseer met spaarrekening, termijnrekening of pensioensparen.",
      steps: [
        "Open of verhoog een spaarrekening",
        "Bekijk pensioensparen (fonds of verzekering)",
        "Overweeg tak 21 / tak 23 langetermijnsparen",
      ],
      ctaLabel: "Sparen bekijken",
      cta: "save",
      evidence: evidence(txs, SAVE).slice(0, 4),
    },
    pension: {
      id: "rec-pension",
      step: "pension",
      revenueModel: "sparen",
      title: "Start pensioensparen",
      body: "Met je inkomen is pensioensparen via fonds of verzekering een sterke volgende stap.",
      steps: ["Kies pensioensparen", "Stel maandelijkse storting in", "Vraag Kate naar fiscaal voordeel"],
      ctaLabel: "Pensioensparen",
      cta: "save",
      evidence: evidence(txs, SAVE).slice(0, 3),
    },
    invest: {
      id: "rec-invest",
      step: "invest",
      revenueModel: "beleggen",
      title: "Begin met beleggen",
      body: "Ruimte om te beleggen: beleggingsplan, fondsen, wisselgeld of zelf via Bolero.",
      steps: [
        "Start een beleggingsplan",
        "Probeer beleggen met wisselgeld",
        "Of beleg zelf via Bolero",
      ],
      ctaLabel: "Open Beleggen",
      cta: "beleggen",
      evidence: [...evidence(txs, INVEST), ...evidence(txs, SAVE)].slice(0, 4),
    },
    insure_home: {
      id: "rec-insure-home",
      step: "insure_home",
      revenueModel: "verzekeren",
      title: "Brandverzekering regelen",
      body: "Bij woonplannen hoort een brandverzekering via KBC Verzekeringen.",
      steps: ["Vraag brandverzekeringsofferte", "Check inboedeldekkening", "Koppel aan hypotheek"],
      ctaLabel: "Verzekering starten",
      cta: "insure",
      evidence: evidence(txs, HOME).slice(0, 4),
    },
    insure_car: {
      id: "rec-insure-car",
      step: "insure_car",
      revenueModel: "verzekeren",
      title: "Autoverzekering checken",
      body: "Wagenkosten? Zorg voor een passende BA/omnium via KBC Verzekeringen.",
      steps: ["Vergelijk autoverzekering", "Voeg pechverhelping toe", "Betaal Q8 via KBC Mobile"],
      ctaLabel: "Autoverzekering",
      cta: "insure",
      evidence: evidence(txs, CAR).slice(0, 4),
    },
    insure_family: {
      id: "rec-insure-family",
      step: "insure_family",
      revenueModel: "verzekeren",
      title: "Gezin & hospitalisatie",
      body: "Zorgkosten suggereren famili- of hospitalisatieverzekering.",
      steps: ["Bekijk hospitalisatieverzekering", "Check famili-verzekering", "Vraag Kate om advies"],
      ctaLabel: "Gezinsverzekering",
      cta: "insure",
      evidence: evidence(txs, HEALTH).slice(0, 4),
    },
    mobility: {
      id: "rec-mobility",
      step: "mobility",
      revenueModel: "mobiliteit",
      title: "Mobiliteit in KBC Mobile",
      body: "Tickets, parking en tanken — regel het via MyMobility en verdien Kate Coins.",
      steps: [
        "Koop NMBS / De Lijn / MIVB tickets",
        "Betaal parking via 4411 of Q-Park",
        "Verdien Kate Coins bij partners",
      ],
      ctaLabel: "Open mobiliteit",
      cta: "mobility",
      evidence: evidence(txs, MOBILITY).slice(0, 4),
    },
    kate_coins: {
      id: "rec-kate-coins",
      step: "kate_coins",
      revenueModel: "mobiliteit",
      title: "Meer uit Kate Coins",
      body: "Gebruik KBC Mobile voor tickets en tanken en krijg cashbacks via Kate Coins.",
      steps: ["Activeer gepersonaliseerde aanbiedingen", "Betaal via KBC bij partners", "Wissel coins in voor voordelen"],
      ctaLabel: "Kate Coins",
      cta: "mobility",
      evidence: evidence(txs, [...MOBILITY, ...CAR]).slice(0, 4),
    },
    business: {
      id: "rec-business",
      step: "business",
      revenueModel: "zakelijk",
      title: "Zakelijke oplossingen",
      body: "Voor ondernemers: zichtrekening, kredietkaart, leasing of werkkapitaal.",
      steps: ["Bekijk zakelijke rekeningen", "Ontdek investeringskrediet / leasing", "Regel VAPZ / IPT pensioen"],
      ctaLabel: "Open Zakelijk",
      cta: "zakelijk",
      evidence: evidence(txs, BUSINESS).slice(0, 4),
    },
    general: {
      id: "rec-general",
      step: "general",
      revenueModel: "betalen",
      title: "kAIte volgt je geldstromen",
      body: "Op basis van betalingen stellen we de volgende stap voor: sparen, lenen, beleggen of verzekeren.",
      steps: ["Bekijk recente verrichtingen", "Vraag Kate om advies", "Ontdek Aanbod"],
      ctaLabel: "Vraag het Kate",
      cta: "none",
      evidence: txs.slice(0, 3).map((t) => t.merchant),
    },
  };

  const pick = catalog[step];
  return {
    ...pick,
    evidence: pick.evidence.length > 0 ? pick.evidence : txs.slice(0, 3).map((t) => t.merchant),
  };
};
