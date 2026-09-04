import { Camera, ChevronRight, FileCheck2, Image, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef } from "react";
import type { Health, Receipt } from "../types";

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
      <header className="mobile-brand"><span className="brand-mark"><span /></span><strong>Receipt Relay</strong><ShieldCheck /></header>
      <section className="intro">
        <h1>Turn a receipt into useful feedback.</h1>
      </section>

      <section className="capture-panel" aria-label="Upload a receipt">
        <button className="camera-target" disabled={busy} onClick={() => cameraRef.current?.click()} data-testid="take-photo">
          <span className="camera-orbit"><Camera /></span>
          <strong>{busy ? "Checking image…" : "Take a photo"}</strong>
        </button>
        <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choose(event.target.files)} />
        <button className="secondary-button gallery-button" disabled={busy} onClick={() => galleryRef.current?.click()}><Image /> Choose from gallery</button>
        <input ref={galleryRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => choose(event.target.files)} data-testid="gallery-input" />
        <div className="privacy-note"><LockKeyhole /><span><strong>Your receipt stays private</strong><small>Stored only on this device’s local server. Delete it at any time.</small></span></div>
        {health ? <p className="provider-note"><span className={health.aiProvider === "Claude" ? "provider-live" : "provider-demo"} /> {health.aiProvider} · up to {health.maxImages} images, {health.maxUploadMb} MB each</p> : null}
        {health && !health.analysisEnabled ? <div className="setup-warning" role="status"><strong>Real recognition is off</strong><span>Add an Anthropic Console API key to <code>.env</code>. Uploaded images will never be replaced with demo receipt data.</span></div> : null}
      </section>

      <section className="recent-section">
        <div className="section-heading"><h2>Recent activity</h2><button onClick={onQueue}>See all</button></div>
        {recent.length ? <div className="activity-list">{recent.map((receipt) => <button className="activity-row" key={receipt.id} onClick={() => onOpen(receipt)}>
          <StatusIcon status={receipt.status} />
          <span><strong>{receipt.store || "Receipt awaiting review"}</strong><small>{formatWhen(receipt.createdAt)}</small></span>
          <em className={`status-text status-${receipt.status}`}>{statusLabel(receipt.status)}</em><ChevronRight />
        </button>)}</div> : <div className="empty-recent"><FileCheck2 /><p><strong>No receipts yet</strong><br /><span>Your latest uploads will appear here.</span></p></div>}
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: Receipt["status"] }) {
  return <span className={`status-icon status-${status}`}><FileCheck2 /></span>;
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
