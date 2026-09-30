import type { LoanProductId, RevenueModel } from "./types";

export type LoanProduct = {
  id: LoanProductId;
  name: string;
  short: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  defaultAmount: number;
  rates: { years: number; apr: number }[];
  relatedInsurance?: string;
};

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    id: "hypotheek",
    name: "Hypothecaire lening",
    short: "Woning",
    description: "Financier de aankoop van je woning met een KBC-hypotheek.",
    minAmount: 50000,
    maxAmount: 600000,
    defaultAmount: 250000,
    rates: [
      { years: 20, apr: 3.2 },
      { years: 25, apr: 3.35 },
      { years: 30, apr: 3.5 },
    ],
    relatedInsurance: "Schuldsaldoverzekering",
  },
  {
    id: "overbrugging",
    name: "Overbruggingskrediet",
    short: "Overbrugging",
    description: "Overbrug de periode tussen aankoop van je nieuwe en verkoop van je huidige woning.",
    minAmount: 10000,
    maxAmount: 200000,
    defaultAmount: 80000,
    rates: [
      { years: 1, apr: 4.1 },
      { years: 2, apr: 4.25 },
    ],
    relatedInsurance: "Brandverzekering",
  },
  {
    id: "energie",
    name: "Energielening",
    short: "Energie",
    description: "Investeer in isolatie, warmtepomp of zonnepanelen.",
    minAmount: 2500,
    maxAmount: 50000,
    defaultAmount: 15000,
    rates: [
      { years: 5, apr: 2.9 },
      { years: 10, apr: 3.1 },
    ],
  },
  {
    id: "renovatie",
    name: "Renovatielening",
    short: "Renovatie",
    description: "Financier verbouwingswerken aan je woning.",
    minAmount: 2500,
    maxAmount: 75000,
    defaultAmount: 25000,
    rates: [
      { years: 5, apr: 3.4 },
      { years: 10, apr: 3.6 },
    ],
    relatedInsurance: "Brandverzekering",
  },
  {
    id: "auto",
    name: "Autolening",
    short: "Auto",
    description: "Voor benzine-, hybride- of elektrische wagens.",
    minAmount: 5000,
    maxAmount: 80000,
    defaultAmount: 22000,
    rates: [
      { years: 4, apr: 4.5 },
      { years: 5, apr: 4.7 },
      { years: 6, apr: 4.9 },
    ],
    relatedInsurance: "Autoverzekering",
  },
  {
    id: "fiets",
    name: "Fietslening",
    short: "Fiets",
    description: "Voor (elektrische) fietsen en speed pedelecs.",
    minAmount: 500,
    maxAmount: 8000,
    defaultAmount: 2500,
    rates: [
      { years: 2, apr: 3.9 },
      { years: 3, apr: 4.1 },
    ],
  },
  {
    id: "moto",
    name: "Motorlening",
    short: "Motor",
    description: "Financier je motorfiets via KBC.",
    minAmount: 2000,
    maxAmount: 25000,
    defaultAmount: 9000,
    rates: [
      { years: 3, apr: 4.6 },
      { years: 5, apr: 4.8 },
    ],
    relatedInsurance: "Autoverzekering",
  },
  {
    id: "camper",
    name: "Camperlenging",
    short: "Camper",
    description: "Voor campers en motorhomes.",
    minAmount: 10000,
    maxAmount: 100000,
    defaultAmount: 45000,
    rates: [
      { years: 5, apr: 4.4 },
      { years: 7, apr: 4.6 },
    ],
  },
  {
    id: "boot",
    name: "Bootlening",
    short: "Boot",
    description: "Voor boten en watersportvaartuigen.",
    minAmount: 5000,
    maxAmount: 80000,
    defaultAmount: 20000,
    rates: [
      { years: 5, apr: 4.5 },
      { years: 7, apr: 4.7 },
    ],
  },
];

export const REVENUE_LABELS: Record<RevenueModel, string> = {
  betalen: "Betalen",
  sparen: "Sparen",
  beleggen: "Beleggen",
  lenen: "Lenen",
  verzekeren: "Verzekeren",
  mobiliteit: "Mobiliteit",
  zakelijk: "Zakelijk",
};

export function monthlyPayment(amount: number, years: number, aprPercent: number): number {
  const n = years * 12;
  const r = aprPercent / 100 / 12;
  if (r === 0) return amount / n;
  return (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatEuroExact(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
