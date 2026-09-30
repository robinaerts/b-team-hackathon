import { useMemo, useState } from "react";
import {
  LOAN_PRODUCTS,
  formatEuro,
  formatEuroExact,
  monthlyPayment,
  type LoanProductId,
} from "../recommendations";

type Step = "type" | "amount" | "duration" | "summary" | "done";

export function LoanFlow({
  initialProduct,
  onClose,
  onComplete,
}: {
  initialProduct?: LoanProductId;
  onClose: () => void;
  onComplete: (msg: string) => void;
}) {
  const [step, setStep] = useState<Step>(initialProduct ? "amount" : "type");
  const [productId, setProductId] = useState<LoanProductId>(initialProduct ?? "hypotheek");
  const product = LOAN_PRODUCTS.find((p) => p.id === productId) ?? LOAN_PRODUCTS[0];
  const [amount, setAmount] = useState(product.defaultAmount);
  const [years, setYears] = useState(product.rates[product.rates.length - 1]?.years ?? 5);
  const [addInsurance, setAddInsurance] = useState(true);

  const rate = product.rates.find((r) => r.years === years) ?? product.rates[0];
  const monthly = useMemo(
    () => monthlyPayment(amount, rate.years, rate.apr),
    [amount, rate.years, rate.apr],
  );

  const selectProduct = (id: LoanProductId) => {
    const p = LOAN_PRODUCTS.find((x) => x.id === id)!;
    setProductId(id);
    setAmount(p.defaultAmount);
    setYears(p.rates[p.rates.length - 1]?.years ?? 5);
    setStep("amount");
  };

  return (
    <div className="flow-overlay" role="dialog" aria-label="Lening aanvragen">
      <div className="flow-sheet">
        <header className="flow-head">
          <button className="flow-back" onClick={step === "type" ? onClose : () => setStep(prevStep(step))}>
            ←
          </button>
          <div>
            <p className="flow-kicker">Lenen · kAIte</p>
            <h2>{titleFor(step)}</h2>
          </div>
          <button className="flow-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </header>

        <div className="flow-progress">
          {(["type", "amount", "duration", "summary"] as Step[]).map((s, i) => (
            <span key={s} className={stepIndex(step) >= i ? "on" : ""} />
          ))}
        </div>

        <div className="flow-body">
          {step === "type" && (
            <ul className="flow-options">
              {LOAN_PRODUCTS.map((p) => (
                <li key={p.id}>
                  <button
                    className={productId === p.id ? "selected" : ""}
                    onClick={() => selectProduct(p.id)}
                  >
                    <span className="flow-opt-title">{p.name}</span>
                    <span className="flow-opt-sub">{p.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === "amount" && (
            <div className="flow-form">
              <p className="flow-label">{product.name}</p>
              <p className="flow-amount-display">{formatEuro(amount)}</p>
              <input
                type="range"
                min={product.minAmount}
                max={product.maxAmount}
                step={product.id === "fiets" ? 100 : 500}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <div className="flow-range-meta">
                <span>{formatEuro(product.minAmount)}</span>
                <span>{formatEuro(product.maxAmount)}</span>
              </div>
              <button className="flow-primary" onClick={() => setStep("duration")}>
                Verder
              </button>
            </div>
          )}

          {step === "duration" && (
            <div className="flow-form">
              <p className="flow-label">Kies looptijd</p>
              <div className="flow-chips">
                {product.rates.map((r) => (
                  <button
                    key={r.years}
                    className={years === r.years ? "on" : ""}
                    onClick={() => setYears(r.years)}
                  >
                    {r.years} j · {r.apr.toFixed(2)}%
                  </button>
                ))}
              </div>
              <div className="flow-stat">
                <span>Geschatte maandlast</span>
                <strong>{formatEuroExact(monthly)}</strong>
              </div>
              <button className="flow-primary" onClick={() => setStep("summary")}>
                Naar overzicht
              </button>
            </div>
          )}

          {step === "summary" && (
            <div className="flow-form">
              <ul className="flow-summary">
                <li>
                  <span>Product</span>
                  <strong>{product.name}</strong>
                </li>
                <li>
                  <span>Bedrag</span>
                  <strong>{formatEuro(amount)}</strong>
                </li>
                <li>
                  <span>Looptijd</span>
                  <strong>
                    {years} jaar · {rate.apr.toFixed(2)}% JKP
                  </strong>
                </li>
                <li>
                  <span>Maandlast</span>
                  <strong>{formatEuroExact(monthly)}</strong>
                </li>
              </ul>

              {product.relatedInsurance && (
                <label className="flow-check">
                  <input
                    type="checkbox"
                    checked={addInsurance}
                    onChange={(e) => setAddInsurance(e.target.checked)}
                  />
                  <span>
                    Voeg <strong>{product.relatedInsurance}</strong> toe (KBC Verzekeringen)
                  </span>
                </label>
              )}

              <p className="flow-hint">
                Demo-aanvraag — geen echte kredietaanvraag. Kate Coins kunnen later toegekend worden.
              </p>

              <button
                className="flow-primary"
                onClick={() => {
                  setStep("done");
                  onComplete(
                    addInsurance && product.relatedInsurance
                      ? `${product.name} aangevraagd + ${product.relatedInsurance}`
                      : `${product.name} aangevraagd`,
                  );
                }}
              >
                Bevestig aanvraag
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="flow-done">
              <div className="flow-done-icon">✓</div>
              <h3>Aanvraag ontvangen</h3>
              <p>
                Je {product.name.toLowerCase()} van {formatEuro(amount)} is klaargezet. Een adviseur
                of Kate volgt op.
              </p>
              <p className="flow-coins">+50 Kate Coins gereserveerd</p>
              <button className="flow-primary" onClick={onClose}>
                Terug naar Start
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductFlow({
  kind,
  onClose,
  onComplete,
}: {
  kind: "insure" | "save" | "mobility";
  onClose: () => void;
  onComplete: (msg: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const config = PRODUCT_FLOWS[kind];

  return (
    <div className="flow-overlay" role="dialog" aria-label={config.title}>
      <div className="flow-sheet">
        <header className="flow-head">
          <button className="flow-back" onClick={onClose}>
            ←
          </button>
          <div>
            <p className="flow-kicker">{config.kicker}</p>
            <h2>{config.title}</h2>
          </div>
          <button className="flow-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </header>
        <div className="flow-body">
          <p className="flow-intro">{config.intro}</p>
          <ul className="flow-options">
            {config.options.map((o) => (
              <li key={o.id}>
                <button
                  className={picked === o.id ? "selected" : ""}
                  onClick={() => setPicked(o.id)}
                >
                  <span className="flow-opt-title">{o.title}</span>
                  <span className="flow-opt-sub">{o.sub}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            className="flow-primary"
            disabled={!picked}
            onClick={() => {
              const o = config.options.find((x) => x.id === picked);
              onComplete(o ? `${o.title} geactiveerd` : config.title);
              onClose();
            }}
          >
            {config.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

const PRODUCT_FLOWS = {
  insure: {
    kicker: "Verzekeren · kAIte",
    title: "Kies een verzekering",
    intro: "KBC Verzekeringen — auto, woning, gezin, hospitalisatie, reis, schuldsaldo of leven.",
    cta: "Offerte aanvragen",
    options: [
      { id: "brand", title: "Brandverzekering", sub: "Woning en inboedel" },
      { id: "auto", title: "Autoverzekering", sub: "BA, mini-omnium of omnium" },
      { id: "family", title: "Familiale verzekering", sub: "Burgerlijke aansprakelijkheid gezin" },
      { id: "hospital", title: "Hospitalisatie", sub: "Dekking bij hospitalisatie" },
      { id: "schuldsaldo", title: "Schuldsaldoverzekering", sub: "Bij hypothecaire lening" },
      { id: "leven", title: "Levensverzekering", sub: "Bescherming voor nabestaanden" },
      { id: "reis", title: "Reisverzekering", sub: "Voor jouw trips" },
    ],
  },
  save: {
    kicker: "Sparen · kAIte",
    title: "Sparen & pensioen",
    intro: "Spaarrekeningen, huurwaarborg, pensioensparen, tak 21/23 en termijnrekeningen.",
    cta: "Product openen",
    options: [
      { id: "spaar", title: "Spaarrekening", sub: "Flexibel sparen, ook voor kinderen" },
      { id: "huurwaarborg", title: "Huurwaarborg", sub: "Blokkeer waarborg op spaarrekening" },
      { id: "pensioen", title: "Pensioensparen", sub: "Via fonds of verzekering" },
      { id: "tak21", title: "Langetermijnsparen tak 21", sub: "Kapitaalsgarantie" },
      { id: "tak23", title: "Tak 23", sub: "Rendement gekoppeld aan fondsen" },
      { id: "termijn", title: "Termijnrekening", sub: "Vaste rente voor vaste periode" },
    ],
  },
  mobility: {
    kicker: "Mobiliteit · Kate Coins",
    title: "Niet-bancaire diensten",
    intro: "Tickets, parking, tanken en vignettes — en cashbacks via Kate Coins.",
    cta: "Open dienst",
    options: [
      { id: "nmbs", title: "NMBS / De Lijn / MIVB", sub: "Koop tickets in de app" },
      { id: "4411", title: "Parking 4411 / Q-Park", sub: "Betaal parking vanuit Mobile" },
      { id: "q8", title: "Q8 tanken", sub: "Betaal aan de pomp via KBC" },
      { id: "vignette", title: "Vignet bestellen", sub: "Snelwegvignet in enkele tikken" },
      { id: "coins", title: "Kate Coins", sub: "Cashbacks bij KBC en partners" },
    ],
  },
} as const;

export { ProductFlow };

function stepIndex(step: Step): number {
  return ["type", "amount", "duration", "summary", "done"].indexOf(step);
}

function prevStep(step: Step): Step {
  const order: Step[] = ["type", "amount", "duration", "summary", "done"];
  return order[Math.max(0, order.indexOf(step) - 1)] ?? "type";
}

function titleFor(step: Step): string {
  switch (step) {
    case "type":
      return "Kies je lening";
    case "amount":
      return "Leenbedrag";
    case "duration":
      return "Looptijd";
    case "summary":
      return "Overzicht";
    case "done":
      return "Gelukt";
  }
}
