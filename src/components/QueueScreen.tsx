import { Archive, CalendarClock, CheckCircle2, ChevronRight, Clock3, FileWarning, Inbox, RotateCcw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Receipt } from "../types";
import { formatWhen, statusLabel } from "./UploadScreen";
import { IconWell } from "./IconWell";

interface Props {
  receipts: Receipt[];
  historyOnly: boolean;
  busy: boolean;
  onOpen: (receipt: Receipt) => void;
  onRetry: (receipt: Receipt) => void;
  onCancel: (receipt: Receipt) => void;
  onArchive: (receipt: Receipt) => void;
}

export function QueueScreen({ receipts, historyOnly, busy, onOpen, onRetry, onCancel, onArchive }: Props) {
  const needsAttention = receipts.filter((receipt) => ["quality_review", "needs_attention", "failed"].includes(receipt.status));
  const scheduled = receipts.filter((receipt) => ["ready", "scheduled"].includes(receipt.status));
  const completed = receipts.filter((receipt) => receipt.status === "completed");
  const drafts = receipts.filter((receipt) => ["ready_for_confirmation", "draft"].includes(receipt.status));
  return <div className="page queue-page">
    <header className="queue-header"><div><h1>{historyOnly ? "History" : "Your queue"}</h1><p>{historyOnly ? "Completed surveys." : "Pick up exactly where you left off."}</p></div><span>{historyOnly ? completed.length : receipts.length} total</span></header>
    {historyOnly ? <QueueGroup title="Completed" icon={<CheckCircle2 />} receipts={completed} tone="complete" {...{ busy, onOpen, onRetry, onCancel, onArchive }} /> : <>
      <QueueGroup title="Needs attention" icon={<FileWarning />} receipts={needsAttention} tone="attention" {...{ busy, onOpen, onRetry, onCancel, onArchive }} />
      <QueueGroup title="Ready & scheduled" icon={<CalendarClock />} receipts={scheduled} tone="scheduled" {...{ busy, onOpen, onRetry, onCancel, onArchive }} />
      <QueueGroup title="Drafts" icon={<Clock3 />} receipts={drafts} tone="draft" {...{ busy, onOpen, onRetry, onCancel, onArchive }} />
      <QueueGroup title="Completed" icon={<CheckCircle2 />} receipts={completed} tone="complete" {...{ busy, onOpen, onRetry, onCancel, onArchive }} />
    </>}
    {!receipts.length || (historyOnly && !completed.length) ? <div className="queue-empty"><IconWell><Inbox /></IconWell><h2>Nothing here yet</h2><p>{historyOnly ? "Completed surveys will appear here." : "Upload a receipt to start your queue."}</p></div> : null}
  </div>;
}

interface GroupProps extends Omit<Props, "receipts" | "historyOnly"> { title: string; icon: ReactNode; receipts: Receipt[]; tone: string }
function QueueGroup({ title, icon, receipts, tone, busy, onOpen, onRetry, onCancel, onArchive }: GroupProps) {
  if (!receipts.length) return null;
  return <section className={`queue-group tone-${tone}`}><div className="queue-group-title"><IconWell>{icon}</IconWell><h2>{title}</h2><span className="group-count">{receipts.length}</span></div><div className="queue-list">
    {receipts.map((receipt) => <article className="queue-row" key={receipt.id}>
      <button className="queue-main" onClick={() => onOpen(receipt)}><IconWell className={`queue-status status-${receipt.status}`}>{statusIcon(receipt.status)}</IconWell><span><strong>{receipt.store || "Receipt awaiting review"}</strong><small>{receipt.scheduledAt ? `Reminder ${formatWhen(receipt.scheduledAt)}` : formatWhen(receipt.updatedAt)} · {statusLabel(receipt.status)}</small>{receipt.failureReason ? <em>{receipt.failureReason}</em> : null}</span><ChevronRight /></button>
      <div className="queue-actions">
        {["failed", "needs_attention"].includes(receipt.status) ? <button disabled={busy} onClick={() => onRetry(receipt)}><RotateCcw /> Retry</button> : null}
        {receipt.status === "completed" ? <button disabled={busy} onClick={() => onArchive(receipt)}><Archive /> Archive</button> : null}
        {!(["completed", "canceled"].includes(receipt.status)) ? <button disabled={busy} onClick={() => onCancel(receipt)}><XCircle /> Cancel</button> : null}
      </div>
    </article>)}
  </div></section>;
}

function statusIcon(status: Receipt["status"]) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "scheduled" || status === "ready") return <Clock3 />;
  return <FileWarning />;
}
