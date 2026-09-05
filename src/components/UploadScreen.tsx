import { ArrowRight, Camera, CheckCircle2, ChevronRight, Clock3, FileCheck2, Image, LoaderCircle, LockKeyhole, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import type { Health, Receipt } from "../types";
import { IconWell } from "./IconWell";

interface Props {
  receipts: Receipt[];
  health: Health | null;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onOpen: (receipt: Receipt) => void;
  onQueue: () => void;
}

export function UploadScreen({ receipts, health, busy, onUpload, onOpen, onQueue }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const recent = receipts.slice(0, 3);
  const choose = (list: FileList | null) => list?.length && onUpload(Array.from(list));
  return (
    <div className="page home-page">
      <section className="intro">
        <h1>Turn a receipt into <span>useful feedback.</span></h1>
        <p>Capture your receipt. Confirm your visit.<br className="mobile-break" /> Let Receipt Relay take it from there.</p>
      </section>

      <div className="home-workspace">
      <section className="capture-panel" aria-label="Upload a receipt">
        <div className="capture-surface">
          <div className="capture-heading"><h2>Start with a receipt</h2><span>JPG, PNG or WebP</span></div>
          <button className="camera-target" disabled={busy} onClick={() => cameraRef.current?.click()} data-testid="take-photo" aria-label={busy ? "Checking image…" : "Take a photo"}>
            <IconWell className="camera-orbit">{busy ? <LoaderCircle className="spin" /> : <Camera />}</IconWell>
            <span className="capture-instruction">A little paper.<br />A useful next step.</span>
            <span className="capture-hint">Keep the full receipt in frame.</span>
            <strong className="capture-cta">{busy ? "Checking image…" : "Take a photo"}<ArrowRight aria-hidden="true" /></strong>
          </button>
        <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choose(event.target.files)} />
        <button className="gallery-button" disabled={busy} onClick={() => galleryRef.current?.click()}><IconWell><Image /></IconWell><span>Choose from gallery</span><ChevronRight aria-hidden="true" /></button>
        <input ref={galleryRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => choose(event.target.files)} data-testid="gallery-input" />
        </div>
        <div className="privacy-note"><IconWell><LockKeyhole /></IconWell><span><strong>Your receipt stays private</strong><small>Stored only on this device’s local server. Delete it at any time.</small></span></div>
        {health ? <p className="provider-note"><span className={health.aiProvider === "Claude" ? "provider-live" : "provider-demo"} /> {health.aiProvider} · up to {health.maxImages} images, {health.maxUploadMb} MB each</p> : null}
        {health && !health.analysisEnabled ? <div className="setup-warning" role="status"><strong>Real recognition is off</strong><span>Add an Anthropic Console API key to <code>.env</code>. Uploaded images will never be replaced with demo receipt data.</span></div> : null}
      </section>

      <section className="recent-section">
        <div className="section-heading"><h2>Recent activity</h2><button onClick={onQueue}>See all <ArrowRight aria-hidden="true" /></button></div>
        {recent.length ? <div className="activity-list">{recent.map((receipt) => <button className="activity-row" key={receipt.id} onClick={() => onOpen(receipt)}>
          <StatusIcon status={receipt.status} />
          <span><strong>{receipt.store || "Receipt awaiting review"}</strong><small>{formatWhen(receipt.createdAt)}</small></span>
          <em className={`status-text status-${receipt.status}`}>{statusLabel(receipt.status)}</em><ChevronRight />
        </button>)}</div> : <div className="empty-recent"><IconWell><FileCheck2 /></IconWell><p><strong>No receipts yet</strong><span>Your latest uploads will appear here.</span></p></div>}
      </section>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Receipt["status"] }) {
  const Icon = status === "completed" ? CheckCircle2 : ["failed", "needs_attention"].includes(status) ? TriangleAlert : ["ready", "scheduled"].includes(status) ? Clock3 : FileCheck2;
  return <IconWell className={`status-icon status-${status}`}><Icon /></IconWell>;
}

export function statusLabel(status: Receipt["status"]) {
  return ({ quality_review: "Check photo", needs_attention: "Needs attention", ready_for_confirmation: "Review", draft: "Draft", ready: "Ready", scheduled: "Scheduled", completed: "Completed", failed: "Failed", canceled: "Canceled" } as const)[status];
}

export function formatWhen(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
