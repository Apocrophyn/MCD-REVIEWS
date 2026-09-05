import { AlertTriangle, ArrowLeft, Check, RotateCcw, ScanLine, Sparkles, X } from "lucide-react";
import { imageUrl } from "../lib/api";
import type { Receipt } from "../types";
import { IconWell } from "./IconWell";

interface Props { receipt: Receipt; busy: boolean; analysisEnabled: boolean; onBack: () => void; onAnalyze: () => void; onRetake: () => void }

export function QualityScreen({ receipt, busy, analysisEnabled, onBack, onAnalyze, onRetake }: Props) {
  const rejected = receipt.classification?.isReceipt === false;
  const analysisFailed = receipt.status === "failed" && analysisEnabled;
  const unavailable = !analysisEnabled;
  const checks = [
    ["Readable", "Text has enough detail", receipt.images.every((image) => image.quality.readable)],
    ["Full receipt", "Edges appear in frame", receipt.images.every((image) => image.quality.fullReceipt)],
    ["No glare", "Lighting looks usable", receipt.images.every((image) => image.quality.noGlare)],
  ] as const;
  const allGood = checks.every((check) => check[2]);
  return <div className="page focused-page quality-page">
    <header className="focus-header"><button className="icon-button" onClick={onBack} aria-label="Back"><ArrowLeft /></button><h1>Check your photo</h1><span /></header>
    <div className="quality-layout">
      <section className="receipt-preview-wrap">
        <div className="scan-corners"><ScanLine /><img src={imageUrl(receipt.id, receipt.images[0].id)} alt="Uploaded receipt" /></div>
        {receipt.images.length > 1 ? <div className="thumbnail-rail">{receipt.images.map((image, index) => <img key={image.id} src={imageUrl(receipt.id, image.id)} alt={`Receipt image ${index + 1}`} />)}</div> : null}
      </section>
      <section className="quality-actions">
        {rejected || unavailable || analysisFailed ? <div className="receipt-rejection" role="alert">
          <IconWell><AlertTriangle /></IconWell>
          <h2>{rejected ? "This doesn’t look like a receipt" : unavailable ? "Receipt recognition isn’t available" : "Receipt analysis couldn’t finish"}</h2>
          <p>{receipt.failureReason || "Set ANTHROPIC_API_KEY on the server to classify real images. Receipt Relay no longer substitutes hardcoded sample data."}</p>
          {receipt.classification?.evidence.length ? <ul>{receipt.classification.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul> : null}
        </div> : <div className="check-list">{checks.map(([label, detail, passed]) => <div className="check-row" key={label}>
          <span className={passed ? "check-pass" : "check-fail"}>{passed ? <Check /> : <X />}</span><strong>{label}</strong><small>{detail}</small>
        </div>)}</div>}
        {!rejected && !unavailable && !analysisFailed && !allGood ? <p className="quality-warning">This photo may be harder to read. Retaking it in even light will improve accuracy, or continue and carefully verify the result.</p> : null}
        {!rejected && !unavailable ? <button className="primary-button" onClick={onAnalyze} disabled={busy}><Sparkles /> {busy ? "Classifying image…" : analysisFailed ? "Try analysis again" : "Classify & read receipt"}</button> : null}
        <button className={rejected || unavailable || analysisFailed ? "primary-button" : "secondary-button"} onClick={onRetake} disabled={busy}><RotateCcw /> {rejected || unavailable || analysisFailed ? "Choose another image" : "Retake"}</button>
      </section>
    </div>
  </div>;
}
