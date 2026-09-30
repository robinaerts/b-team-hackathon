import { useState } from "react";
import type { QuestionChip, Questionnaire, QuestionKind } from "./catalog";

const KIND_LABEL: Record<QuestionKind, string> = {
  signal: "Signal",
  preference: "Preference",
  pulse: "Weekly pulse",
};

export function QuestionnaireModal({
  question,
  onAnswer,
  onSkip,
}: {
  question: Questionnaire;
  onAnswer: (chip: QuestionChip) => void;
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="q-modal" role="dialog" aria-modal="true" aria-label="kAIte question">
      <button className="q-modal-backdrop" aria-label="Close" onClick={onSkip} />
      <div className="q-modal-panel">
        <div className="q-modal-top">
          <span className={`q-kind q-kind-${question.kind}`}>{KIND_LABEL[question.kind]}</span>
          <button className="q-modal-close" onClick={onSkip} aria-label="Skip">
            ×
          </button>
        </div>

        {question.signal && <p className="q-modal-signal">{question.signal}</p>}

        <div className="q-modal-body">
          <h2 className="q-modal-question">{question.question}</h2>
          {question.subtitle && <p className="q-modal-sub">{question.subtitle}</p>}

          <div className="q-modal-chips">
            {question.chips.map((chip) => (
              <button
                key={chip.id}
                className="q-modal-chip"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  onAnswer(chip);
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <p className="q-modal-foot">Your answer opens the next step · trains kAIte</p>
      </div>
    </div>
  );
}
