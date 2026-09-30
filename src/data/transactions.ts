export type Transaction = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  date: string;
};

/** Recent mock transactions — shared by Start payments preview and kAIte. */
export const recentTransactions: Transaction[] = [
  { id: "tx1", merchant: "Immoweb Premium", amount: -29.99, category: "housing", date: "Vandaag" },
  { id: "tx2", merchant: "Notaris Van den Berg", amount: -450.0, category: "housing", date: "Gisteren" },
  { id: "tx3", merchant: "Ikea Gent", amount: -312.4, category: "furniture", date: "28 Sep" },
  { id: "tx4", merchant: "Huurgeld — Kot Leuven", amount: -625.0, category: "rent", date: "27 Sep" },
  { id: "tx5", merchant: "Loon Acme BV", amount: 2850.0, category: "income", date: "25 Sep" },
  { id: "tx6", merchant: "Colruyt Leuven", amount: -54.32, category: "groceries", date: "24 Sep" },
  { id: "tx7", merchant: "Spotify", amount: -17.99, category: "subscriptions", date: "22 Sep" },
  { id: "tx8", merchant: "Fluvius energie", amount: -142.8, category: "energy", date: "20 Sep" },
  { id: "tx9", merchant: "Brico Isolatie", amount: -89.5, category: "renovation", date: "18 Sep" },
  { id: "tx10", merchant: "Spaarrekening storting", amount: -400.0, category: "savings", date: "15 Sep" },
  { id: "tx11", merchant: "TotalEnergies Q8", amount: -78.2, category: "mobility", date: "14 Sep" },
  { id: "tx12", merchant: "NMBS ticket", amount: -18.5, category: "mobility", date: "13 Sep" },
  { id: "tx13", merchant: "Parking 4411", amount: -4.2, category: "parking", date: "12 Sep" },
  { id: "tx14", merchant: "Bike Center Leuven", amount: -189.0, category: "bike", date: "10 Sep" },
  { id: "tx15", merchant: "Shell Carwash", amount: -22.0, category: "car", date: "8 Sep" },
  { id: "tx16", merchant: "UZ Leuven factuur", amount: -65.0, category: "health", date: "5 Sep" },
];

export function formatTxAmount(amount: number): string {
  const formatted = new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount >= 0 ? `+${formatted} EUR` : `−${formatted} EUR`;
}
