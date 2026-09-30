import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { formatTxAmount, recentTransactions } from "./data/transactions";
import { LoanFlow, ProductFlow } from "./flows/LoanFlow";
import {
  answersToModelFeatures,
  isoWeekKey,
  loadQuestionnaireStore,
  saveQuestionnaireStore,
  type QuestionChip,
  type Questionnaire,
  type QuestionnaireStore,
} from "./questionnaires/catalog";
import { QuestionnaireModal } from "./questionnaires/QuestionnaireCard";
import { pickQuestionnaire } from "./questionnaires/select";
import {
  fetchRecommendation,
  getRecommendation,
  REVENUE_LABELS,
  type LoanProductId,
  type Recommendation,
} from "./recommendations";

type TabId = "start" | "mijnkbc" | "beleggen" | "zakelijk" | "aanbod";
type HubId = "accounts" | "myhome";
type ActiveFlow =
  | { kind: "loan"; product?: LoanProductId }
  | { kind: "insure" | "save" | "mobility" }
  | null;

const homeListings = [
  {
    id: "h1",
    city: "Oostende",
    price: "289 000,00",
    tag: "Residentie vastgoed",
    epc: "E",
    epcColor: "#e67e22",
    specs: [154, 340, 2, 2, 0],
    tone: "house",
  },
  {
    id: "h2",
    city: "Oostende",
    price: "345 000,00",
    tag: "Appartement",
    epc: "C",
    epcColor: "#f1c40f",
    specs: [98, 0, 2, 1, 1],
    tone: "interior",
  },
  {
    id: "h3",
    city: "Brugge",
    price: "425 000,00",
    tag: "Rijhuis",
    epc: "D",
    epcColor: "#f39c12",
    specs: [168, 210, 3, 2, 1],
    tone: "brick",
  },
];

const homeDiscover = [
  {
    id: "d1",
    title: "Brandverzekering",
    body: "Verzeker je tegen de financiële gevolgen van schade aan je woning en de inhoud ervan.",
    icon: "flame" as const,
  },
  {
    id: "d2",
    title: "Bereken je renovatiekost",
    body: "Bekijk hoeveel de werken die je wilt uitvoeren aan je woning je zullen kosten.",
    icon: "reno" as const,
  },
  {
    id: "d3",
    title: "Maak je woning energiezuiniger",
    body: "Zonnepanelen, een warmtepomp, isolatie... Bekijk hoe je geld kunt besparen.",
    icon: "energy" as const,
  },
];

const homePlanTabs = ["Kopen", "Verbouwen", "Verkopen", "Verzekeren"] as const;

const accounts = [
  {
    id: "kate",
    kind: "kate" as const,
    name: "Kate Coins",
    balance: "0,00 KTC",
    color: "kate",
  },
  {
    id: "personal",
    kind: "account" as const,
    name: "AERTS ROBIN",
    balance: "7,15 EUR",
    color: "cyan",
  },
  {
    id: "business",
    kind: "account" as const,
    name: "Gertjan VZW",
    balance: "0,00 EUR",
    color: "navy",
  },
];

const forYou = [
  {
    id: "f1",
    type: "action" as const,
    title: "Te behandelen",
    body: "Je hebt 1 of meer te behandelen acties. Even kijken?",
  },
  {
    id: "f2",
    type: "kate" as const,
    title: "Kate tip",
    body: "Energieprijzen blijven hoog. Bespaar warmte thuis — isoleer, ventileer slim en check je verbruik.",
  },
  {
    id: "f3",
    type: "data" as const,
    title: "Gegevens updaten",
    body: "Wanneer heb je je gegevens voor het laatst nagekeken? Update ze via Kate.",
  },
];

const mijnAccounts = [
  {
    name: "AERTS ROBIN",
    iban: "BE71 7350 7405 7969",
    balance: "7,15 EUR",
  },
];

const products = [
  { id: "p1", label: "Rekeningen", icon: "wallet" },
  { id: "p2", label: "Betaalmiddelen", icon: "card" },
  { id: "p3", label: "Sparen en beleggen", icon: "piggy" },
  { id: "p4", label: "Leningen", icon: "loan" },
];

const themes = [
  { id: "t1", label: "MyMobility", color: "#0077c8", icon: "sign" },
  { id: "t2", label: "MyHome", color: "#00aeef", icon: "home" },
  { id: "t3", label: "Samen duurzamer", color: "#34c759", icon: "leaf" },
  { id: "t4", label: "Zicht op geldzaken", color: "#ffcc00", icon: "bulb" },
];

type ForYouItem = (typeof forYou)[number];

export default function App() {
  const [tab, setTab] = useState<TabId>("start");
  const [hub, setHub] = useState<HubId>("accounts");
  const [showPayments, setShowPayments] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [time, setTime] = useState("19:11");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);
  const [recommendation, setRecommendation] = useState<Recommendation>(() =>
    getRecommendation(recentTransactions),
  );
  const [suggestions, setSuggestions] = useState<Recommendation[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [qStore, setQStore] = useState<QuestionnaireStore>(() => loadQuestionnaireStore());
  const [activeQuestion, setActiveQuestion] = useState<Questionnaire | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const sessionCounted = useRef(false);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("nl-BE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // New app open → bump session, pick question
  useEffect(() => {
    setQStore((prev) => {
      if (sessionCounted.current) return prev;
      sessionCounted.current = true;
      const next = { ...prev, sessionCount: prev.sessionCount + 1 };
      saveQuestionnaireStore(next);
      setActiveQuestion(pickQuestionnaire(recentTransactions, next));
      return next;
    });
  }, []);

  const refreshRecommendation = (store: QuestionnaireStore) => {
    setModelLoading(true);
    const feats = answersToModelFeatures(store.answers);
    fetchRecommendation(recentTransactions, feats).then((recs) => {
      setSuggestions(recs);
      setRecommendation(recs[0] ?? getRecommendation(recentTransactions));
      setModelLoading(false);
    });
  };

  useEffect(() => {
    refreshRecommendation(qStore);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + when answers change via handler
  }, []);

  const notify = (msg: string) => setToast(msg);

  const goTab = (next: TabId) => {
    setTab(next);
    if (next !== "start") setHub("accounts");
  };

  const openMyHome = () => {
    setTab("start");
    setHub("myhome");
  };

  const applyQuestionAction = (chip: QuestionChip) => {
    const a = chip.action;
    if ("message" in a && a.message) notify(a.message);
    switch (a.type) {
      case "flow":
        if (a.flow === "loan") {
          setActiveFlow({ kind: "loan", product: (a.product as LoanProductId) || "hypotheek" });
        } else {
          setActiveFlow({ kind: a.flow });
        }
        break;
      case "hub":
        setTab("start");
        setHub(a.hub);
        break;
      case "tab":
        goTab(a.tab);
        break;
      case "notify":
        break;
      case "freeze":
        if (!a.message) notify("Transfer frozen · contacting you via KBC Live");
        break;
      case "support":
        if (!a.message) notify("Quiet support route opened · Kate will follow up");
        break;
      default:
        break;
    }
  };

  const handleQuestionAnswer = (chip: QuestionChip) => {
    if (!activeQuestion) return;
    const answer = {
      questionId: activeQuestion.id,
      kind: activeQuestion.kind,
      chipId: chip.id,
      label: chip.label,
      answeredAt: new Date().toISOString(),
      signal: activeQuestion.signal,
    };
    setQStore((prev) => {
      const next: QuestionnaireStore = {
        ...prev,
        answers: [...prev.answers.filter((a) => a.questionId !== activeQuestion.id), answer],
        prefsAsked:
          activeQuestion.kind === "preference"
            ? [...new Set([...prev.prefsAsked, activeQuestion.id])]
            : prev.prefsAsked,
        lastPulseWeek: activeQuestion.kind === "pulse" ? isoWeekKey() : prev.lastPulseWeek,
        lastPulseId: activeQuestion.kind === "pulse" ? activeQuestion.id : prev.lastPulseId,
      };
      saveQuestionnaireStore(next);
      refreshRecommendation(next);
      return next;
    });
    applyQuestionAction(chip);
    setActiveQuestion(null);
  };

  const handleQuestionSkip = () => {
    if (!activeQuestion) return;
    setQStore((prev) => {
      const next: QuestionnaireStore = {
        ...prev,
        dismissedSignals:
          activeQuestion.kind === "signal"
            ? [...new Set([...prev.dismissedSignals, activeQuestion.id])]
            : prev.dismissedSignals,
        prefsAsked:
          activeQuestion.kind === "preference"
            ? [...new Set([...prev.prefsAsked, activeQuestion.id])]
            : prev.prefsAsked,
        lastPulseWeek: activeQuestion.kind === "pulse" ? isoWeekKey() : prev.lastPulseWeek,
        lastPulseId: activeQuestion.kind === "pulse" ? activeQuestion.id : prev.lastPulseId,
      };
      saveQuestionnaireStore(next);
      return next;
    });
    setActiveQuestion(null);
  };

  const handleKaiteCta = (rec: Recommendation) => {
    switch (rec.cta) {
      case "myhome":
        openMyHome();
        notify(rec.title);
        break;
      case "beleggen":
        goTab("beleggen");
        notify(rec.title);
        break;
      case "zakelijk":
        goTab("zakelijk");
        notify(rec.title);
        break;
      case "loan":
        setActiveFlow({ kind: "loan", product: rec.loanProduct });
        break;
      case "insure":
        setActiveFlow({ kind: "insure" });
        break;
      case "save":
        setActiveFlow({ kind: "save" });
        break;
      case "mobility":
        setActiveFlow({ kind: "mobility" });
        break;
      default:
        notify("Vraag het Kate via de zoekbalk");
    }
  };

  return (
    <div className="stage">
      <div className="phone">
        <div className="phone-bezel">
          <div className={`phone-screen ${hub === "myhome" && tab === "start" ? "myhome-mode" : ""}`}>
            <StatusBar time={time} battery={tab === "start" ? 21 : 23} blue={hub === "myhome" && tab === "start"} />

            {tab === "start" && hub === "accounts" && (
              <StartScreen
                carouselRef={carouselRef}
                showPayments={showPayments}
                setShowPayments={setShowPayments}
                forYou={forYou.filter((f) => !dismissed.includes(f.id))}
                onDismiss={(id) => setDismissed((d) => [...d, id])}
                notify={notify}
                hub={hub}
                setHub={setHub}
                recommendation={recommendation}
                suggestions={suggestions}
                modelLoading={modelLoading}
                onKaiteCta={(rec) => handleKaiteCta(rec)}
              />
            )}

            {tab === "start" && hub === "myhome" && (
              <MyHomeScreen
                notify={notify}
                hub={hub}
                setHub={setHub}
                onOpenLoan={(product) => setActiveFlow({ kind: "loan", product })}
              />
            )}

            {tab === "mijnkbc" && <MijnKbcScreen notify={notify} />}
            {tab === "aanbod" && <AanbodScreen notify={notify} onOpenMyHome={openMyHome} />}
            {tab === "beleggen" && <BeleggenScreen notify={notify} />}
            {tab === "zakelijk" && <ZakelijkScreen notify={notify} />}

            {((tab === "start" && hub === "accounts") || tab === "zakelijk") && (
              <button className="fab" aria-label="Overschrijving" onClick={() => notify("Nieuwe overschrijving")}>
                <TransferIcon />
              </button>
            )}

            <BottomNav tab={tab} setTab={goTab} onStartAccounts={() => setHub("accounts")} />

            {activeFlow?.kind === "loan" && (
              <LoanFlow
                initialProduct={activeFlow.product}
                onClose={() => setActiveFlow(null)}
                onComplete={(msg) => notify(msg)}
              />
            )}
            {activeFlow && activeFlow.kind !== "loan" && (
              <ProductFlow
                kind={activeFlow.kind}
                onClose={() => setActiveFlow(null)}
                onComplete={(msg) => notify(msg)}
              />
            )}

            {activeQuestion && (
              <QuestionnaireModal
                question={activeQuestion}
                onAnswer={handleQuestionAnswer}
                onSkip={handleQuestionSkip}
              />
            )}

            {toast && <div className="toast">{toast}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ time, battery, blue }: { time: string; battery: number; blue?: boolean }) {
  return (
    <div className={`status-bar ${blue ? "status-blue" : ""}`}>
      <span className="status-time">{time}</span>
      <div className="status-right">
        <SignalIcon />
        <WifiIcon />
        <span className="battery-pct">{battery}%</span>
        <BatteryIcon />
      </div>
    </div>
  );
}

function HubChips({ hub, setHub }: { hub: HubId; setHub: (h: HubId) => void }) {
  return (
    <div className={`chips ${hub === "myhome" ? "chips-home" : ""}`}>
      <button
        className={`chip ${hub === "accounts" ? "active" : ""}`}
        aria-label="Rekeningen"
        onClick={() => setHub("accounts")}
      >
        <WalletIcon />
      </button>
      <button className="chip" onClick={() => setHub("accounts")}>
        <NewsIcon />
        MyNWS
      </button>
      <button
        className={`chip ${hub === "myhome" ? "active-home" : ""}`}
        onClick={() => setHub("myhome")}
      >
        <HomeIcon />
        MyHome
      </button>
      <button className="chip" onClick={() => setHub("accounts")}>
        <SignIcon />
        MyMobility
      </button>
    </div>
  );
}

function StartScreen({
  carouselRef,
  showPayments,
  setShowPayments,
  forYou: items,
  onDismiss,
  notify,
  hub,
  setHub,
  recommendation,
  suggestions,
  modelLoading,
  onKaiteCta,
}: {
  carouselRef: RefObject<HTMLDivElement | null>;
  showPayments: boolean;
  setShowPayments: (v: boolean | ((p: boolean) => boolean)) => void;
  forYou: ForYouItem[];
  onDismiss: (id: string) => void;
  notify: (m: string) => void;
  hub: HubId;
  setHub: (h: HubId) => void;
  recommendation: Recommendation;
  suggestions: Recommendation[];
  modelLoading: boolean;
  onKaiteCta: (rec: Recommendation) => void;
}) {
  return (
    <>
      <header className="top-bar start-bar">
        <button className="circle-btn" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
          <GearIcon />
        </button>
        <div className="search-pill" onClick={() => notify("Kate openen")}>
          <SearchIcon />
          <span>Hoe kan ik je helpen?</span>
          <span className="kate-chip">
            <KateMark small />
            Kate
          </span>
        </div>
        <button className="circle-btn" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
          <BellIcon />
          <span className="red-dot" />
        </button>
      </header>

      <main className="scroll">
        <HubChips hub={hub} setHub={setHub} />

        <div className="account-rail" ref={carouselRef}>
          {accounts.map((a) => (
            <article key={a.id} className={`acct-card ${a.color}`} onClick={() => notify(a.name)}>
              <div className="acct-top">
                {a.kind === "kate" ? <KateMark /> : <WalletLargeIcon />}
                {a.kind === "account" && (
                  <button
                    className="edit-btn"
                    aria-label="Bewerken"
                    onClick={(e) => {
                      e.stopPropagation();
                      notify("Rekening bewerken");
                    }}
                  >
                    <PencilIcon />
                  </button>
                )}
                <div className="acct-pattern" aria-hidden />
              </div>
              <div className="acct-bottom">
                <p className="acct-name">{a.name}</p>
                <p className="acct-bal">{a.balance}</p>
                {a.kind === "kate" && <div className="kate-progress" />}
              </div>
            </article>
          ))}
          <button className="acct-card edit-end" onClick={() => notify("Edit favourites")}>
            <span className="plus">+</span>
            <span>Favorieten</span>
          </button>
        </div>

        <button className="show-payments" onClick={() => setShowPayments((v) => !v)}>
          <ChevronDown open={showPayments} />
          {showPayments ? "Verberg betalingen" : "Toon betalingen"}
        </button>

        {showPayments && (
          <ul className="payments-preview">
            {recentTransactions.slice(0, 5).map((tx) => (
              <li key={tx.id}>
                <span>
                  {tx.merchant}
                  <small className="tx-date">{tx.date}</small>
                </span>
                <span className={tx.amount > 0 ? "pos" : ""}>{formatTxAmount(tx.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <KaiteBanner
          recommendation={recommendation}
          suggestions={suggestions}
          modelLoading={modelLoading}
          onCta={onKaiteCta}
        />

        <section className="voor-jou">
          <div className="section-row">
            <h2>Voor jou</h2>
            <button className="link" onClick={() => notify("Alle communicatie")}>
              Alle communicatie
            </button>
          </div>

          <div className="feed">
            {items.map((item) => (
              <article key={item.id} className={`feed-card ${item.type}`} onClick={() => notify(item.title)}>
                <span className="feed-dot" />
                {item.type !== "action" && (
                  <button
                    className="feed-close"
                    aria-label="Sluiten"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(item.id);
                    }}
                  >
                    ×
                  </button>
                )}
                <div className="feed-icon">
                  {item.type === "action" && <BellRedIcon />}
                  {item.type === "kate" && <HomeCoinsIcon />}
                  {item.type === "data" && <BarsIcon />}
                </div>
                <div className="feed-body">
                  {item.type === "action" && <p className="feed-title alert">{item.title}</p>}
                  {item.type === "kate" && (
                    <p className="feed-title kate-label">
                      <KateMark tiny /> {item.title}
                    </p>
                  )}
                  {item.type === "data" && <p className="feed-title">{item.title}</p>}
                  <p className="feed-text">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="scroll-pad" />
      </main>
    </>
  );
}

function KaiteBanner({
  recommendation,
  suggestions,
  modelLoading,
  onCta,
}: {
  recommendation: Recommendation;
  suggestions: Recommendation[];
  modelLoading: boolean;
  onCta: (rec: Recommendation) => void;
}) {
  const [shapFor, setShapFor] = useState<Recommendation | null>(null);
  const products = suggestions.length > 0 ? suggestions : [recommendation];
  const fromModel = products.some((p) => p.modelSource === "model.joblib");

  return (
    <section className="kaite-banner" aria-label="kAIte productvoorstellen">
      <div className="kaite-banner-glow" aria-hidden />
      <div className="kaite-banner-head">
        <span className="kaite-brand">
          <KateMark small />
          <span className="kaite-name">
            k<span className="kaite-ai">AI</span>te
          </span>
        </span>
        <span className="kaite-badge">Volgend product</span>
      </div>

      {modelLoading && <p className="kaite-loading">Model + SHAP laden…</p>}

      <p className="kaite-intro">Op basis van je transacties kan dit als volgende passen:</p>

      <ul className="kaite-products">
        {products.map((rec, idx) => (
          <li key={rec.id} className="kaite-product">
            <div className="kaite-product-main">
              <div className="kaite-product-top">
                <span className="kaite-product-rank">{idx + 1}</span>
                <h3 className="kaite-product-title">{rec.title}</h3>
                <button
                  type="button"
                  className="kaite-info"
                  aria-label={`Waarom ${rec.title}? (SHAP)`}
                  title="Waarom dit product? (SHAP)"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShapFor(rec);
                  }}
                >
                  <InfoIcon />
                </button>
              </div>
              <p className="kaite-product-body">{rec.body}</p>
              {fromModel && rec.modelProbability != null && (
                <div className="kaite-score">
                  <span>
                    Kans <strong>{(rec.modelProbability * 100).toFixed(0)}%</strong>
                  </span>
                  {rec.modelLift != null && (
                    <span>
                      Lift <strong>×{rec.modelLift.toFixed(1)}</strong>
                    </span>
                  )}
                  <span className="kaite-source">{REVENUE_LABELS[rec.revenueModel]}</span>
                </div>
              )}
              <button className="kaite-cta kaite-cta-sm" onClick={() => onCta(rec)}>
                {rec.ctaLabel}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!fromModel && !modelLoading && (
        <p className="kaite-fallback">Rules-engine (API offline) — start de Python-server voor het ML-model.</p>
      )}

      {recommendation.evidence.length > 0 && (
        <p className="kaite-evidence">
          Gebaseerd op o.a. {recommendation.evidence.slice(0, 3).join(", ")}
        </p>
      )}

      {shapFor &&
        createPortal(
          <ShapExplainSheet recommendation={shapFor} onClose={() => setShapFor(null)} />,
          document.querySelector(".phone-screen") ?? document.body,
        )}
    </section>
  );
}

function ShapExplainSheet({
  recommendation,
  onClose,
}: {
  recommendation: Recommendation;
  onClose: () => void;
}) {
  const drivers = recommendation.shapDrivers ?? [];

  return (
    <div className="shap-sheet" role="dialog" aria-modal="true" aria-label="SHAP-uitleg">
      <button className="shap-backdrop" aria-label="Sluiten" onClick={onClose} />
      <div className="shap-panel">
        <div className="shap-head">
          <div>
            <p className="shap-kicker">SHAP-uitleg</p>
            <h3>{recommendation.title}</h3>
          </div>
          <button className="shap-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </div>

        <p className="shap-intro">
          SHAP (SHapley Additive exPlanations) toont welke kenmerken de modelkans voor dit product
          verhogen of verlagen t.o.v. een gemiddelde klant.
        </p>

        {recommendation.modelProbability != null && (
          <p className="shap-scoreline">
            Modelkans{" "}
            <strong>{(recommendation.modelProbability * 100).toFixed(1)}%</strong>
            {recommendation.modelLift != null && (
              <>
                {" "}
                · lift <strong>×{recommendation.modelLift.toFixed(2)}</strong>
              </>
            )}
          </p>
        )}

        {drivers.length > 0 ? (
          <ul className="shap-drivers">
            {drivers.map((d) => {
              const up = d.effect > 0;
              return (
                <li key={d.feature} className={up ? "up" : "down"}>
                  <div className="shap-driver-top">
                    <span className="shap-driver-label">{d.label}</span>
                    <span className={`shap-effect ${up ? "up" : "down"}`}>
                      {up ? "+" : "−"}
                      {(Math.abs(d.effect) * 100).toFixed(1)} pp
                    </span>
                  </div>
                  <p className="shap-driver-meta">
                    Waarde: {d.value} · {up ? "verhoogt" : "verlaagt"} de kans
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="shap-fallback">
            {recommendation.shapReason
              ? `Geen SHAP-drivers beschikbaar. Reden: ${recommendation.shapReason}.`
              : "Geen SHAP-drivers beschikbaar voor deze voorspelling."}
          </p>
        )}

        <p className="shap-foot">
          Effecten in procentpunt kans t.o.v. de trainingsachtergrondpopulatie.
        </p>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function MyHomeScreen({
  notify,
  hub,
  setHub,
  onOpenLoan,
}: {
  notify: (m: string) => void;
  hub: HubId;
  setHub: (h: HubId) => void;
  onOpenLoan: (product?: LoanProductId) => void;
}) {
  const [planTab, setPlanTab] = useState<(typeof homePlanTabs)[number]>("Kopen");

  return (
    <>
      <div className="myhome-header">
        <header className="top-bar start-bar home-bar">
          <button className="circle-btn home-circle" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
            <GearIcon />
          </button>
          <div className="search-pill home-search" onClick={() => notify("Kate openen")}>
            <span>Hoe kan ik je helpen?</span>
            <span className="kate-chip home-kate">
              <KateMark small />
              Kate
            </span>
          </div>
          <button className="circle-btn home-circle" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
            <BellIcon />
            <span className="red-dot" />
          </button>
        </header>
        <HubChips hub={hub} setHub={setHub} />
      </div>

      <main className="scroll home-scroll">
        <article className="home-hero">
          <div className="home-bubbles" aria-hidden>
            <span className="bubble b-family"><FamilyIcon /></span>
            <span className="bubble b-keys"><KeysIcon /></span>
            <span className="bubble b-main"><HomeIconLarge /></span>
            <span className="bubble b-bed"><BedIcon /></span>
            <span className="bubble b-pin"><PinIcon /></span>
            <span className="bubble b-tree"><TreeIcon /></span>
            <span className="bubble b-cat"><CatIcon /></span>
          </div>
          <h2>Waar woon je?</h2>
          <p>We willen je graag beter leren kennen.</p>
          <button className="home-cta" onClick={() => notify("Woning toevoegen")}>
            Woning toevoegen
          </button>
        </article>

        <section className="mk-section">
          <div className="section-row">
            <h2>Start je woonplannen</h2>
            <button className="link" onClick={() => notify("Bekijk meer")}>
              Bekijk meer
            </button>
          </div>

          <div className="plan-tabs">
            {homePlanTabs.map((t) => (
              <button key={t} className={planTab === t ? "active" : ""} onClick={() => setPlanTab(t)}>
                {t}
              </button>
            ))}
          </div>

          {planTab === "Kopen" ? (
            <div className="timeline">
              <div className="tl-item">
                <span className="tl-dot" />
                <p className="tl-label">Voor je begint</p>
                <button className="tl-card" onClick={() => notify("Budget berekenen")}>
                  <span className="tl-icon">
                    <CoinsIcon />
                  </span>
                  <span className="tl-copy">
                    <span className="mk-name">Wat is je budget?</span>
                    <span className="mk-sub">Aankoopprijs, belasting, notaris,... Bekijk de totaalkost van je woonplan.</span>
                  </span>
                  <span className="arrow-btn">
                    <ArrowRightIcon />
                  </span>
                </button>
              </div>

              <div className="tl-item">
                <span className="tl-dot" />
                <p className="tl-label">Vind hier een huis of appartement</p>
                <button className="criteria-link" onClick={() => notify("Zoekcriteria")}>
                  <SearchHomeIcon />
                  Zoekcriteria aanpassen
                </button>
              </div>
            </div>
          ) : (
            <div className="plan-empty">
              <p>Inhoud voor “{planTab}” volgt in deze replica.</p>
            </div>
          )}
        </section>

        {planTab === "Kopen" && (
          <>
            <section className="mk-section">
              <div className="listing-rail">
                {homeListings.map((l) => (
                  <article key={l.id} className="listing-card" onClick={() => notify(`${l.city} — ${l.price} EUR`)}>
                    <div className={`listing-photo ${l.tone}`}>
                      <span className="listing-tag">{l.tag}</span>
                      <span className="epc" style={{ background: l.epcColor }}>
                        EPC {l.epc}
                      </span>
                    </div>
                    <div className="listing-body">
                      <p className="listing-city">{l.city}</p>
                      <p className="listing-price">
                        {l.price} <span>EUR</span>
                      </p>
                      <div className="listing-specs">
                        {l.specs.map((n, i) => (
                          <div key={i}>
                            <SpecIcon i={i} />
                            <span>{n}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        className="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          notify("Bekijken");
                        }}
                      >
                        Bekijken
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="immo-credit">
                <span className="immo-logo">immo scoop</span>
                <span>Aangeboden door immoscoop</span>
              </div>
            </section>

            <section className="mk-section">
              <p className="section-bullet">Bekijk hoeveel je kunt lenen</p>
              <button className="tl-card mortgage" onClick={() => onOpenLoan("hypotheek")}>
                <span className="tl-icon">
                  <HandCoinsIcon />
                </span>
                <span className="tl-copy">
                  <span className="mk-name">Lenen voor je woning</span>
                  <span className="mk-sub">Simuleer je hypothecaire lening. Je kunt ze ook digitaal afsluiten.</span>
                </span>
                <span className="arrow-btn">
                  <ArrowRightIcon />
                </span>
              </button>
            </section>

            <section className="mk-section">
              <div className="section-row">
                <h2>Ontdek meer rond kopen</h2>
              </div>
              <ul className="discover-list">
                {homeDiscover.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => notify(d.title)}>
                      <span className="discover-icon">
                        {d.icon === "flame" && <FlameIcon />}
                        {d.icon === "reno" && <RenoIcon />}
                        {d.icon === "energy" && <EnergyDocIcon />}
                      </span>
                      <span className="tl-copy">
                        <span className="mk-name">{d.title}</span>
                        <span className="mk-sub">{d.body}</span>
                      </span>
                      <ChevronRightIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <div className="scroll-pad" />
      </main>
    </>
  );
}

function MijnKbcScreen({ notify }: { notify: (m: string) => void }) {
  return (
    <>
      <header className="top-bar page-bar">
        <button className="circle-btn" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
          <GearIcon />
        </button>
        <h1 className="page-title">Mijn KBC</h1>
        <div className="page-actions">
          <button className="circle-btn" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
            <BellIcon />
            <span className="red-dot" />
          </button>
          <button className="kate-round" aria-label="Kate" onClick={() => notify("Kate")}>
            <KateMark />
          </button>
        </div>
      </header>

      <main className="scroll page-scroll">
        <section className="mk-section">
          <div className="section-row">
            <h2>Rekeningen</h2>
            <button className="nieuw" onClick={() => notify("Nieuwe rekening")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
          {mijnAccounts.map((a) => (
            <button key={a.iban} className="mk-row" onClick={() => notify(a.name)}>
              <span className="mk-icon blue">
                <WalletIcon />
              </span>
              <span className="mk-meta">
                <span className="mk-name">{a.name}</span>
                <span className="mk-sub">{a.iban}</span>
              </span>
              <span className="mk-bal">{a.balance}</span>
            </button>
          ))}
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Betaalmiddelen</h2>
            <button className="nieuw" onClick={() => notify("Nieuw betaalmiddel")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
          <button className="mk-row has-badge" onClick={() => notify("KBC-Debetkaart")}>
            <span className="nieuw-badge">Nieuw</span>
            <span className="mk-icon blue">
              <BancontactIcon />
            </span>
            <span className="mk-meta">
              <span className="mk-name">KBC-Debetkaart</span>
              <span className="mk-sub">AERTS ROBIN</span>
              <span className="mk-sub">**** 2248</span>
            </span>
          </button>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Kate Coins</h2>
          </div>
          <button className="mk-row" onClick={() => notify("Kate Coins")}>
            <span className="mk-icon kate-bg">
              <KateMark />
            </span>
            <span className="mk-meta">
              <span className="mk-name">Kate Coins</span>
            </span>
            <span className="mk-bal">0,00 KTC</span>
          </button>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Beleggingen</h2>
            <button className="nieuw" onClick={() => notify("Nieuwe belegging")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
          <button className="mk-row" onClick={() => notify("Beleggingen")}>
            <span className="mk-icon ghost">
              <PiggyOutlineIcon />
            </span>
            <span className="mk-meta">
              <span className="mk-name soft">Spaar- en beleggingsproducten van anderen</span>
            </span>
          </button>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Leningen</h2>
            <button className="nieuw" onClick={() => notify("Nieuwe lening")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
        </section>

        <div className="scroll-pad" />
      </main>
    </>
  );
}

function AanbodScreen({
  notify,
  onOpenMyHome,
}: {
  notify: (m: string) => void;
  onOpenMyHome: () => void;
}) {
  return (
    <>
      <header className="top-bar page-bar">
        <button className="circle-btn" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
          <GearIcon />
        </button>
        <h1 className="page-title">Aanbod</h1>
        <div className="page-actions">
          <button className="circle-btn" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
            <BellIcon />
            <span className="red-dot" />
          </button>
          <button className="kate-round" aria-label="Kate" onClick={() => notify("Kate")}>
            <KateMark />
          </button>
        </div>
      </header>

      <main className="scroll page-scroll">
        <section className="mk-section">
          <div className="section-row">
            <h2>Je favorieten</h2>
            <button className="ellipsis" aria-label="Meer" onClick={() => notify("Favorieten bewerken")}>
              ···
            </button>
          </div>
          <button className="fav-add" aria-label="Toevoegen" onClick={() => notify("Favoriet toevoegen")}>
            +
          </button>
        </section>

        <article className="promo" onClick={() => notify("Zakelijke kredietkaart")}>
          <div className="promo-copy">
            <p>Met de zakelijke kredietkaart van KBC onderneem je méér.</p>
            <button
              className="promo-cta"
              onClick={(e) => {
                e.stopPropagation();
                notify("Vraag nu aan");
              }}
            >
              Vraag nu aan
            </button>
          </div>
          <div className="promo-media" aria-hidden>
            <div className="promo-person" />
          </div>
        </article>

        <section className="mk-section">
          <div className="section-row">
            <h2>KBC-Producten</h2>
          </div>
          <div className="tile-rail">
            {products.map((p) => (
              <button key={p.id} className="product-tile" onClick={() => notify(p.label)}>
                <span className="product-icon">
                  {p.icon === "wallet" && <WalletIcon />}
                  {p.icon === "card" && <CardIcon />}
                  {p.icon === "piggy" && <PiggyIcon />}
                  {p.icon === "loan" && <LoanIcon />}
                </span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Thema&apos;s</h2>
            <button className="link" onClick={() => notify("Alle thema's")}>
              Alles tonen
            </button>
          </div>
          <div className="tile-rail">
            {themes.map((t) => (
              <button
                key={t.id}
                className="theme-tile"
                onClick={() => (t.label === "MyHome" ? onOpenMyHome() : notify(t.label))}
              >
                <span className="theme-icon" style={{ background: t.color }}>
                  {t.icon === "sign" && <SignIcon />}
                  {t.icon === "home" && <HomeIcon />}
                  {t.icon === "leaf" && <LeafIcon />}
                  {t.icon === "bulb" && <BulbIcon />}
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="scroll-pad" />
      </main>
    </>
  );
}

const zakelijkOrgs = ["Alle", "UGENT SAILING VZW", "GERTJAN VZW"] as const;

const zakelijkAccounts = [
  {
    id: "z1",
    org: "UGENT SAILING VZW",
    iban: "BE59 7390 2508 6726",
    amount: "1 747,98",
    type: "current" as const,
  },
  {
    id: "z2",
    org: "GERTJAN VZW",
    iban: "BE69 7350 1234 5678",
    amount: "0,00",
    type: "current" as const,
  },
  {
    id: "z3",
    org: "GERTJAN VZW",
    iban: "BE23 7441 0299 4791",
    amount: "120,00",
    type: "savings" as const,
  },
  {
    id: "z4",
    org: "UGENT SAILING VZW",
    iban: "BE63 7490 2812 2608",
    amount: "0,00",
    type: "savings" as const,
  },
];

const zakelijkCards = [
  { id: "zc1", name: "AERTS ROBIN", last4: "2033", badge: "Net geactiveerd" as string | null },
  { id: "zc2", name: "BAERT JORIEN", last4: "8841", badge: null },
  { id: "zc3", name: "VERBINNEN ANAË", last4: "1190", badge: null },
];

const beleggenProducts = [
  {
    id: "b1",
    title: "UGENT SAILING VZW",
    subtitle: "UGENT SAILING VZW",
    amount: "0,00",
    product: "KBC-Spaarrekening PLUS",
    iban: "BE63 7490 2812 2608",
  },
  {
    id: "b2",
    title: "GERTJAN VZW",
    subtitle: "GERTJAN VZW",
    amount: "29 452,25",
    product: "KBC-Spaarrekening PLUS",
    iban: "BE23 7441 0299 4791",
  },
];

function Money({ value }: { value: string }) {
  const [whole, cents] = value.split(",");
  return (
    <span className="money">
      {whole}
      <span className="cents">,{cents}</span>
      <span className="curr"> EUR</span>
    </span>
  );
}

function BeleggenScreen({ notify }: { notify: (m: string) => void }) {
  return (
    <>
      <header className="top-bar page-bar">
        <button className="circle-btn" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
          <GearIcon />
        </button>
        <h1 className="page-title">Beleggen</h1>
        <div className="page-actions">
          <button className="circle-btn" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
            <BellIcon />
            <span className="red-dot" />
          </button>
          <button className="kate-round" aria-label="Kate" onClick={() => notify("Kate")}>
            <KateMark />
          </button>
        </div>
      </header>

      <main className="scroll page-scroll">
        <section className="mk-section">
          <article className="beleg-card">
            <div className="beleg-card-head">
              <span className="beleg-head-icon">
                <InvestToolsIcon />
              </span>
              <p>Spaar- en beleggingsproducten van anderen</p>
            </div>
            <ul className="beleg-list">
              {beleggenProducts.map((p) => (
                <li key={p.id} onClick={() => notify(p.title)}>
                  <div className="beleg-row-top">
                    <div>
                      <p className="mk-name">{p.title}</p>
                      <p className="mk-sub">{p.subtitle}</p>
                    </div>
                    <Money value={p.amount} />
                  </div>
                  <p className="mk-sub">{p.product}</p>
                  <p className="mk-sub">{p.iban}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>In de kijker</h2>
          </div>
          <article className="spotlight" onClick={() => notify("Langetermijnsparen")}>
            <div className="spotlight-copy">
              <p className="feed-title kate-label">
                <KateMark tiny /> Kate tip
              </p>
              <p>Spaar voor je pensioen en pluk nu al de vruchten met langetermijnsparen.</p>
            </div>
            <div className="spotlight-media" aria-hidden>
              <div className="spotlight-person" />
            </div>
          </article>
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Beleggingsplan</h2>
          </div>
          <button className="mk-row plan-row" onClick={() => notify("Beleggingsplan")}>
            <span className="mk-icon blue">
              <ChartIcon />
            </span>
            <span className="mk-meta">
              <span className="mk-name soft">
                Je hebt nog geen beleggingsplan. Wil je elke maand een bedrag beleggen?
              </span>
            </span>
          </button>
        </section>

        <div className="scroll-pad" />
      </main>
    </>
  );
}

function ZakelijkScreen({ notify }: { notify: (m: string) => void }) {
  const [org, setOrg] = useState<(typeof zakelijkOrgs)[number]>("Alle");
  const filtered = zakelijkAccounts.filter((a) => org === "Alle" || a.org === org);

  return (
    <>
      <header className="top-bar page-bar">
        <button className="circle-btn" aria-label="Instellingen" onClick={() => notify("Instellingen")}>
          <GearIcon />
        </button>
        <h1 className="page-title">Zakelijk</h1>
        <div className="page-actions">
          <button className="circle-btn" aria-label="Meldingen" onClick={() => notify("Meldingen")}>
            <BellIcon />
            <span className="red-dot" />
          </button>
          <button className="filter-round" aria-label="Filter" onClick={() => notify("Filter")}>
            <SlidersIcon />
          </button>
        </div>
      </header>

      <div className="org-tabs">
        {zakelijkOrgs.map((o) => (
          <button key={o} className={org === o ? "active" : ""} onClick={() => setOrg(o)}>
            {o}
          </button>
        ))}
      </div>

      <main className="scroll page-scroll">
        <section className="mk-section">
          <div className="section-row">
            <h2>Rekeningen</h2>
            <button className="nieuw" onClick={() => notify("Nieuwe rekening")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
          {filtered.map((a) => (
            <button key={a.id} className="mk-row" onClick={() => notify(a.org)}>
              <span className="mk-icon patterned">
                {a.type === "current" ? <WalletIcon /> : <PiggyIcon />}
              </span>
              <span className="mk-meta">
                <span className="mk-name">{a.org}</span>
                <span className="mk-sub">{a.iban}</span>
              </span>
              <Money value={a.amount} />
            </button>
          ))}
        </section>

        <section className="mk-section">
          <div className="section-row">
            <h2>Betaalmiddelen</h2>
            <button className="nieuw" onClick={() => notify("Nieuw betaalmiddel")}>
              <span className="nieuw-plus">+</span> Nieuw
            </button>
          </div>
          {zakelijkCards.map((c) => (
            <button key={c.id} className={`mk-row ${c.badge ? "has-badge" : ""}`} onClick={() => notify(c.name)}>
              {c.badge && <span className="status-badge">{c.badge}</span>}
              <span className="mk-icon kbc-card">
                <KbcSailIcon />
              </span>
              <span className="mk-meta">
                <span className="mk-name">KBC-Debetkaart Business</span>
                <span className="mk-sub">{c.name}</span>
                <span className="mk-sub">**** {c.last4}</span>
              </span>
            </button>
          ))}
        </section>

        <div className="scroll-pad" />
      </main>
    </>
  );
}

function BottomNav({
  tab,
  setTab,
  onStartAccounts,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
  onStartAccounts: () => void;
}) {
  const items: { id: TabId; label: string; Icon: () => ReactElement }[] = [
    { id: "start", label: "Start", Icon: WalletIcon },
    { id: "mijnkbc", label: "Mijn KBC", Icon: ListIcon },
    { id: "beleggen", label: "Beleggen", Icon: PiggyIcon },
    { id: "zakelijk", label: "Zakelijk", Icon: BriefcaseIcon },
    { id: "aanbod", label: "Aanbod", Icon: StackIcon },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          onClick={() => {
            setTab(id);
            if (id === "start") onStartAccounts();
          }}
        >
          <span className="nav-icon">
            <Icon />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ——— Icons ——— */

function KateMark({ small, tiny }: { small?: boolean; tiny?: boolean }) {
  const size = tiny ? 14 : small ? 18 : 28;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#00aeef" />
      <path
        d="M10 10.5h4.2c2.6 0 4.2 1.4 4.2 3.5 0 1.5-.8 2.6-2.1 3.1L20.5 22h-3.2l-3.8-4.6H13V22h-3V10.5zm3 5.6h1.1c1.1 0 1.7-.5 1.7-1.4s-.6-1.4-1.7-1.4H13v2.8z"
        fill="#fff"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function BellRedIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e30613" strokeWidth="1.8">
      <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 13.5h2" strokeLinecap="round" />
    </svg>
  );
}

function WalletLargeIcon() {
  return (
    <svg className="wallet-lg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 13.5h2" strokeLinecap="round" />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 5h12a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5Z" />
      <path d="M8 9h6M8 13h4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-8Z" />
    </svg>
  );
}

function SignIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3v18M7 7h8l-2 3 2 3H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 20 4.5-1L20 7.5 16.5 4 5 15.5 4 20Z" />
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
      <path d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 7h11M9 12h11M9 17h11" strokeLinecap="round" />
      <circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PiggyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 12c0-3.5 3-6 7-6 3.2 0 5.8 1.5 6.7 3.8L21 11v3h-1.2c-.4 1.5-1.3 2.7-2.8 3.4V19h-2v-1.2H9.5V19h-2v-1.8C5.8 16.2 5 14.3 5 12Z" />
      <circle cx="9.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PiggyOutlineIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 12c0-3.5 3-6 7-6 3.2 0 5.8 1.5 6.7 3.8L21 11v3h-1.2c-.4 1.5-1.3 2.7-2.8 3.4V19h-2v-1.2H9.5V19h-2v-1.8C5.8 16.2 5 14.3 5 12Z" />
      <circle cx="16" cy="8" r="3" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="m4 8 8-4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </svg>
  );
}

function BancontactIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="#fff" strokeWidth="1.5" />
      <path d="M7 12h4M14 12h3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 9h20" />
    </svg>
  );
}

function LoanIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10.5c.5-1 1.5-1.5 2.5-1.5s2 .6 2 1.8-1 1.7-2.5 2.1c-1.4.4-2.5.9-2.5 2.2S10.5 17 12 17s2-.5 2.5-1.2" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14Z" />
      <path d="M5 19c4-4 8-6 12-8" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11c.5.4 1 1.2 1 2h4c0-.8.5-1.6 1-2a6 6 0 0 0-3-11Z" />
    </svg>
  );
}

function HomeCoinsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#1a3a4a" />
      <path d="m10 20 10-8 10 8v10H10V20Z" stroke="#00aeef" strokeWidth="1.6" />
      <circle cx="28" cy="14" r="5" fill="#ffcc00" opacity="0.9" />
      <circle cx="31" cy="17" r="4" fill="#00aeef" opacity="0.85" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="#1a3a5c" />
      <rect x="8" y="12" width="24" height="3.5" rx="1.5" fill="#00aeef" />
      <rect x="8" y="18.5" width="18" height="3.5" rx="1.5" fill="#34c759" />
      <rect x="8" y="25" width="14" height="3.5" rx="1.5" fill="#ffcc00" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 18 12" fill="currentColor">
      <rect x="0" y="8" width="3" height="4" rx="0.5" />
      <rect x="5" y="5" width="3" height="7" rx="0.5" />
      <rect x="10" y="2" width="3" height="10" rx="0.5" />
      <rect x="15" y="0" width="3" height="12" rx="0.5" opacity="0.35" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="14" height="11" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 4.5c3.8-3.5 10.2-3.5 14 0M3.5 7c2.5-2.2 6.5-2.2 9 0M6.2 9.4c1.4-1.1 2.2-1.1 3.6 0" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="24" height="12" viewBox="0 0 28 14" fill="none">
      <rect x="0.5" y="0.5" width="23" height="13" rx="3" stroke="currentColor" />
      <rect x="2.5" y="2.5" width="8" height="9" rx="1.5" fill="currentColor" />
      <path d="M25 4.5v5a2 2 0 0 0 0-5Z" fill="currentColor" />
    </svg>
  );
}

function InvestToolsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
      <circle cx="17" cy="7" r="2.2" fill="#00aeef" stroke="none" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15v-4M12 15V8M16 15v-6" strokeLinecap="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10M14 5v6M8 13v6" strokeLinecap="round" />
    </svg>
  );
}

function KbcSailIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#fff" />
      <rect y="22" width="32" height="10" fill="#ffcc00" />
      <path d="M8 22C10 12 14 6 16 4c2 2 6 8 8 18H8Z" fill="#0077c8" />
      <path d="M16 4c1.5 3 4 9 5.5 18H16V4Z" fill="#00aeef" />
    </svg>
  );
}

function HomeIconLarge() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
      <path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-8Z" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 19c1.5-3 4-4.5 6-4.5S13.5 16 15 19M14 14.5c1.5-.3 3 .5 4 2.5" />
    </svg>
  );
}

function KeysIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <circle cx="8" cy="14" r="4" />
      <path d="M11.5 11.5 20 3M17 6l2.5 2.5" strokeLinecap="round" />
    </svg>
  );
}

function BedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M3 18V9h8a4 4 0 0 1 4 4v5M3 14h18v4M21 14v-2a2 2 0 0 0-2-2h-4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M12 22v-7M8 15c-3-1-4-4-2-7 3 0 4 2 6 2s3-2 6-2c2 3 1 6-2 7" />
    </svg>
  );
}

function CatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7">
      <path d="M5 10 3 4l5 3M19 10l2-6-5 3" />
      <circle cx="12" cy="13" r="6" />
      <circle cx="10" cy="12" r="0.8" fill="#fff" stroke="none" />
      <circle cx="14" cy="12" r="0.8" fill="#fff" stroke="none" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
      <ellipse cx="10" cy="8" rx="6" ry="3" />
      <path d="M4 8v4c0 1.7 2.7 3 6 3s6-1.3 6-3V8" />
      <path d="M14 11c2.5.3 4 1.4 4 2.8v3c0 1.7-2.2 3-5 3-2 0-3.7-.7-4.5-1.8" />
    </svg>
  );
}

function HandCoinsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
      <path d="M8 13c0-2 1.5-3 3.5-3H18v2.5c0 1.5-1 2.5-2.5 2.5H14" />
      <path d="M4 15.5c0-1.5 1-2.5 2.5-2.5H10v5.5H6.5C5 18.5 4 17.5 4 15.5Z" />
      <circle cx="16" cy="7" r="3" />
      <circle cx="19" cy="9" r="2.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function SearchHomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="m5 11 7-6 7 6v7a1 1 0 0 1-1 1h-4v-4H10v4H6a1 1 0 0 1-1-1v-7Z" />
      <circle cx="17.5" cy="17.5" r="3" />
      <path d="m20 20 1.5 1.5" strokeLinecap="round" />
    </svg>
  );
}

function SpecIcon({ i }: { i: number }) {
  const icons = [
    <path key="a" d="M4 20V10l8-6 8 6v10H4Z" />,
    <path key="b" d="M4 18h16M6 18V8h12v10M9 12h6" />,
    <path key="c" d="M4 18V10h7a3 3 0 0 1 3 3v5M4 14h16v4" />,
    <path key="d" d="M5 12V6h6v6M7 15h10v4H7zM11 12v3" />,
    <path key="e" d="M4 16h16v3H4zM6 16V9l4 2 4-2v7" />,
  ];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {icons[i]}
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00aeef" strokeWidth="1.6">
      <path d="M12 3c2 4-1 5 1 8 1.5 2.2 4 2.5 4 6a5 5 0 0 1-10 0c0-3 2-4.5 3-6.5C11 8 10 6 12 3Z" />
    </svg>
  );
}

function RenoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00aeef" strokeWidth="1.6">
      <path d="m4 12 8-7 8 7v7H4v-7Z" />
      <path d="M14 19v-5h-4v5M16 8l3-3 1.5 1.5" />
    </svg>
  );
}

function EnergyDocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00aeef" strokeWidth="1.6">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v4h4M10 12h5M10 15h3" />
      <path d="M9 19c1.5-3 3-4 4.5-4" />
    </svg>
  );
}
