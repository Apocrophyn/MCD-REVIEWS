import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, CircleUserRound, FileText, FlaskConical, LoaderCircle, Plus, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, imageUrl, proofUrl } from "../lib/api";
import type { AutomationJob, Employee, Experience, Receipt, ReceiptItem } from "../types";
import { IconWell } from "./IconWell";

const attributes = [
  ["food_quality", "Food quality"], ["service", "Service"], ["cleanliness", "Cleanliness"],
  ["wait_time", "Wait time"], ["value", "Value"], ["atmosphere", "Atmosphere"],
] as const;

const satisfactionLabels = ["Very poor", "Poor", "Okay", "Good", "Excellent"];

interface Props {
  receipt: Receipt;
  busy: boolean;
  automationJob: AutomationJob | null;
  onBack: () => void;
  onSave: (update: Partial<Receipt>) => Promise<void>;
  onGenerate: (update: Partial<Receipt>, experience: Experience) => Promise<void>;
  onApprove: (update: Partial<Receipt>, experience: Experience, feedback: string, dryRun: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ReceiptEditor({ receipt, busy, automationJob, onBack, onSave, onGenerate, onApprove, onDelete }: Props) {
  const [store, setStore] = useState(receipt.store);
  const [visitedAt, setVisitedAt] = useState(toLocalDateTime(receipt.visitedAt));
  const [orderNumber, setOrderNumber] = useState(receipt.orderNumber);
  const [surveyCode, setSurveyCode] = useState(receipt.surveyCode);
  const [total, setTotal] = useState(receipt.total == null ? "" : receipt.total.toFixed(2));
  const [items, setItems] = useState(receipt.items);
  const [experience, setExperience] = useState<Experience>({
    attributes: [], satisfaction: 4, notes: "", employeeId: null, attributeRatings: {}, recommendLikelihood: 8,
    returnIntent: 4, orderType: "takeaway", hadProblem: false, contactEmail: "", acceptSurveyTerms: false, ...receipt.experience,
  });
  const [feedback, setFeedback] = useState(receipt.feedback);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [newRole, setNewRole] = useState("");
  const jobActive = automationJob && ["queued", "running"].includes(automationJob.status);
  // A finished practice run must not lock the real submission out.
  const jobComplete = (automationJob?.status === "completed" && !automationJob.dryRun) || receipt.status === "completed";
  // McDonald's UK prints a 12-character alphanumeric code (MKYW-ZM3N-L9VG),
  // so digits-only validation rejected every real receipt.
  const normalizedSurveyCode = surveyCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const hasValidSurveyCode = /^[A-Z0-9]{12}$/.test(normalizedSurveyCode);
  const groupedSurveyCode = normalizedSurveyCode.length === 12
    ? `${normalizedSurveyCode.slice(0, 4)}-${normalizedSurveyCode.slice(4, 8)}-${normalizedSurveyCode.slice(8, 12)}`
    : "";
  const parsedTotal = total === "" ? null : Number(total);
  const hasValidTotal = parsedTotal != null && Number.isFinite(parsedTotal) && parsedTotal > 0 && parsedTotal <= 999.99;
  const canApprove = Boolean(store.trim() && hasValidSurveyCode && hasValidTotal && experience.satisfaction && experience.acceptSurveyTerms && !jobActive && !jobComplete);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => api.listEmployees(employeeQuery).then(({ employees: result }) => live && setEmployees(result)).catch(() => undefined), 160);
    return () => { live = false; window.clearTimeout(timer); };
  }, [employeeQuery]);

  useEffect(() => {
    setFeedback(receipt.feedback);
  }, [receipt.feedback]);

  const receiptUpdate = (): Partial<Receipt> => ({
    store: store.trim(), visitedAt: visitedAt ? new Date(visitedAt).toISOString() : null,
    orderNumber: orderNumber.trim(), surveyCode: surveyCode.trim(), total: hasValidTotal ? parsedTotal : null, items,
  });

  const updateItem = (id: string, update: Partial<ReceiptItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const addItem = () => setItems((current) => [...current, { id: crypto.randomUUID(), quantity: 1, name: "New item", normalizedName: "New Item", price: 0, confidence: 1 }]);
  const toggleAttribute = (attribute: Experience["attributes"][number]) => setExperience((current) => {
    const selected = current.attributes.includes(attribute);
    const ratings = { ...current.attributeRatings };
    if (selected) delete ratings[attribute]; else ratings[attribute] = current.satisfaction;
    return { ...current, attributeRatings: ratings, attributes: selected ? current.attributes.filter((value) => value !== attribute) : [...current.attributes, attribute] };
  });
  const createEmployee = async () => {
    if (!employeeQuery.trim()) return;
    const { employee } = await api.createEmployee({ name: employeeQuery.trim(), role: newRole.trim() });
    setEmployees((current) => [employee, ...current]);
    setExperience((current) => ({ ...current, employeeId: employee.id }));
    setAddingEmployee(false);
  };

  return <div className="page focused-page editor-page">
    <header className="focus-header"><button className="icon-button" onClick={onBack} aria-label="Back"><ArrowLeft /></button><h1>Confirm receipt</h1><span className={`overall-confidence ${confidenceClass(receipt.confidence)}`}>{Math.round(receipt.confidence * 100)}%</span></header>
    <div className="editor-grid">
      <section className="receipt-column">
        <div className="editor-section-heading"><IconWell><FileText /></IconWell><h2>Your receipt</h2></div>
        <img className="editor-receipt-image" src={imageUrl(receipt.id, receipt.images[0].id)} alt="Receipt being confirmed" />
        <div className="quality-compact">{[["Readable", "readable"], ["Full receipt", "fullReceipt"], ["No glare", "noGlare"]].map(([label, key]) => {
          const passed = receipt.images.every((image) => image.quality[key as keyof typeof image.quality]);
          return <span key={key} className={passed ? "pass" : "fail"}>{passed ? <Check /> : <X />}{label}</span>;
        })}</div>
      </section>

      <section className="details-column">
        <div className="editor-section-heading"><h2>Receipt details</h2></div>
        <div className="form-section">
          <div className="field-row"><label htmlFor="store">Store</label><input id="store" value={store} onChange={(event) => setStore(event.target.value)} /></div>
          <div className="field-row"><label htmlFor="date">Date</label><input id="date" type="datetime-local" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} /></div>
          <div className="field-row"><label htmlFor="order">Order number</label><input id="order" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></div>
          <div className="field-row"><label htmlFor="survey">Survey code</label><input id="survey" autoCapitalize="characters" spellCheck={false} maxLength={16} placeholder="MKYW-ZM3N-L9VG" aria-invalid={surveyCode.length > 0 && !hasValidSurveyCode} aria-describedby="survey-hint" value={surveyCode} onChange={(event) => setSurveyCode(event.target.value.toUpperCase())} /></div>
          <p className="field-hint" id="survey-hint">{hasValidSurveyCode
            ? `Reads as ${groupedSurveyCode} — 12 characters, ready for Food for Thoughts.`
            : "12 letters and digits, printed under \u201CTell us how we did\u201D near the top of the receipt."}</p>
          <div className="field-row"><label htmlFor="total">Amount spent</label><input id="total" type="number" min="0.01" max="999.99" step="0.01" aria-invalid={total.length > 0 && !hasValidTotal} value={total} onChange={(event) => setTotal(event.target.value)} /></div>
        </div>

        <div className="subsection-heading"><h2>Items</h2><span>{items.length} found</span></div>
        <div className="items-editor">{items.map((item) => <div className="item-row" key={item.id}>
          <input className="qty-input" aria-label={`Quantity for ${item.name}`} type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} />
          <input aria-label="Item name" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value, normalizedName: event.target.value })} />
          <span className={`confidence ${confidenceClass(item.confidence)}`}>{Math.round(item.confidence * 100)}%</span>
          <span className="currency">£</span><input className="price-input" aria-label={`Price for ${item.name}`} type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, { price: Number(event.target.value) })} />
          <button className="remove-item" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`}><X /></button>
        </div>)}</div>
        <button className="text-button" onClick={addItem}><Plus /> Add item</button>

        <div className="subsection-heading employee-heading"><h2>Add employee <small>(optional)</small></h2></div>
        <div className="employee-search"><Search /><input aria-label="Search employees by name" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search by name" /><button onClick={() => setAddingEmployee(true)}>Add</button></div>
        {employees.length || addingEmployee ? <div className="employee-results">
          {employees.map((employee) => <button className={experience.employeeId === employee.id ? "selected" : ""} key={employee.id} onClick={() => setExperience((current) => ({ ...current, employeeId: current.employeeId === employee.id ? null : employee.id }))}><CircleUserRound /><span><strong>{employee.name}</strong><small>{employee.role || "Team member"}</small></span>{experience.employeeId === employee.id ? <Check /> : <ChevronRight />}</button>)}
          {addingEmployee ? <div className="new-employee"><input aria-label="Employee role" value={newRole} onChange={(event) => setNewRole(event.target.value)} placeholder="Role (optional)" /><button onClick={createEmployee}>Save {employeeQuery || "employee"}</button></div> : null}
        </div> : null}
      </section>

      <section className="experience-column">
        <div className="editor-section-heading"><h2>How was your visit?</h2></div>
        <label className="field-label">Attributes <small>Select all that apply</small></label>
        <div className="attribute-grid">{attributes.map(([value, label]) => <button key={value} aria-pressed={experience.attributes.includes(value)} className={experience.attributes.includes(value) ? "selected" : ""} onClick={() => toggleAttribute(value)}>{experience.attributes.includes(value) ? <Check /> : null}{label}</button>)}</div>
        <label className="field-label satisfaction-label">Overall satisfaction</label>
        <div className="satisfaction" role="radiogroup" aria-label="Overall satisfaction">{satisfactionLabels.map((label, index) => <button role="radio" aria-checked={experience.satisfaction === index + 1} className={experience.satisfaction === index + 1 ? "selected" : ""} key={label} onClick={() => setExperience((current) => ({ ...current, satisfaction: index + 1 }))}><span>{index + 1}</span><small>{label}</small></button>)}</div>
        <div className="survey-details">
          <label>Order type<select value={experience.orderType} onChange={(event) => setExperience((current) => ({ ...current, orderType: event.target.value as Experience["orderType"] }))}><option value="dine_in">Dine in</option><option value="takeaway">Takeaway</option><option value="drive_thru">Drive-thru</option><option value="delivery">Delivery</option><option value="other">Other</option></select></label>
          <label>Would return<select value={experience.returnIntent} onChange={(event) => setExperience((current) => ({ ...current, returnIntent: Number(event.target.value) }))}>{satisfactionLabels.map((label, index) => <option key={label} value={index + 1}>{index + 1} — {label}</option>)}</select></label>
          <label>Recommend <span>{experience.recommendLikelihood}/10</span><input aria-label="Recommendation likelihood" type="range" min="0" max="10" value={experience.recommendLikelihood} onChange={(event) => setExperience((current) => ({ ...current, recommendLikelihood: Number(event.target.value) }))} /></label>
          <label>Problem during visit<select value={experience.hadProblem ? "yes" : "no"} onChange={(event) => setExperience((current) => ({ ...current, hadProblem: event.target.value === "yes" }))}><option value="no">No</option><option value="yes">Yes</option></select></label>
        </div>
        {experience.attributes.length ? <div className="attribute-ratings"><span>Rate selected areas</span>{experience.attributes.map((attribute) => <label key={attribute}>{attributes.find(([key]) => key === attribute)?.[1]}<select value={experience.attributeRatings[attribute] ?? experience.satisfaction} onChange={(event) => setExperience((current) => ({ ...current, attributeRatings: { ...current.attributeRatings, [attribute]: Number(event.target.value) } }))}>{satisfactionLabels.map((label, index) => <option key={label} value={index + 1}>{index + 1} — {label}</option>)}</select></label>)}</div> : null}
        <label className="field-label" htmlFor="notes">What happened? <small>Use only details you observed</small></label>
        <textarea id="notes" maxLength={500} rows={3} value={experience.notes} onChange={(event) => setExperience((current) => ({ ...current, notes: event.target.value }))} placeholder="Food was fresh and the counter team was welcoming." />
        <div className="textarea-count">{experience.notes.length}/500</div>
        <button className="secondary-button generate-button" disabled={busy} onClick={() => onGenerate(receiptUpdate(), experience)}><Sparkles /> {busy ? "Working…" : receipt.feedback ? "Regenerate grounded draft" : "Generate grounded draft"}</button>
        <label className="field-label" htmlFor="feedback">Your feedback <small>Review and edit before approval</small></label>
        <textarea id="feedback" maxLength={500} rows={5} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Your grounded draft will appear here." />
        <div className="textarea-count">{feedback.length}/500</div>
        <label className="field-label" htmlFor="contact-email">Voucher email <small>Only used if the survey asks</small></label>
        <input className="standalone-input" id="contact-email" type="email" value={experience.contactEmail} onChange={(event) => setExperience((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="you@example.com (optional)" />
        <label className="terms-confirmation"><input type="checkbox" checked={experience.acceptSurveyTerms} onChange={(event) => setExperience((current) => ({ ...current, acceptSurveyTerms: event.target.checked }))} /><span><strong>Run the official survey for me</strong><small>I confirm these answers are honest and agree to the official survey terms.</small></span></label>
      </section>

      <aside className="actions-column">
        <div className="editor-section-heading"><IconWell><ShieldCheck /></IconWell><h2>Review & approve</h2></div>
        {jobComplete
          ? <div className="completed-action"><CheckCircle2 /> Survey completed</div>
          : <button className="primary-button" disabled={busy || !canApprove} onClick={() => onApprove(receiptUpdate(), experience, feedback, false)}><ShieldCheck /> {busy ? "Starting survey…" : automationJob ? "Approve & run again" : "Approve & run survey"}</button>}
        {jobComplete ? null : <button className="secondary-button" disabled={busy || !canApprove} onClick={() => onApprove(receiptUpdate(), experience, feedback, true)}><FlaskConical /> Practice run (stops before submitting)</button>}
        <button className="secondary-button" disabled={busy} onClick={() => onSave({ ...receiptUpdate(), experience, feedback })}>Save draft</button>
        <p className="approval-note"><ShieldCheck /><span><strong>No survey tab required</strong><small>A private background browser fills and submits the official survey using only the answers confirmed here.</small></span></p>
        {automationJob ? <div className={`automation-panel automation-${automationJob.status}`} role="status">
          <IconWell className="automation-icon">{automationJob.status === "completed" ? <CheckCircle2 /> : ["failed", "needs_attention"].includes(automationJob.status) ? <AlertTriangle /> : <LoaderCircle className="spin" />}</IconWell>
          <div><h3>{automationTitle(automationJob)}</h3><p>{automationJob.message}</p></div>
          <div className="automation-progress" role="progressbar" aria-label="Survey completion progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={automationJob.progress}><span style={{ transform: `scaleX(${automationJob.progress / 100})` }} /></div>
          {automationJob.status === "needs_attention" ? <small>Update any missing answer above, confirm the terms, and run it again. Receipt Relay will not guess.</small> : null}
          {automationJob.dryRun && automationJob.status === "completed" ? <small>Practice run only — the receipt code is still unused and the receipt stays ready to submit.</small> : null}
          {automationJob.proof ? <figure className="automation-proof">
            <img src={proofUrl(automationJob.id, automationJob.proof)} alt={automationJob.dryRun ? "The survey page the practice run stopped on" : "The Food for Thoughts thank-you page confirming submission"} />
            <figcaption>{automationJob.dryRun ? "Stopped here — nothing submitted" : "Proof of submission captured from Food for Thoughts"}</figcaption>
          </figure> : null}
          {automationJob.transcript.length ? <details className="automation-transcript">
            <summary>What the survey asked ({automationJob.transcript.length} page{automationJob.transcript.length === 1 ? "" : "s"})</summary>
            <ol>{automationJob.transcript.map((page) => <li key={page.index}>
              <strong>{page.heading || `Page ${page.index}`}</strong>
              <small>{page.filled} answer{page.filled === 1 ? "" : "s"} filled{page.action ? ` \u2192 ${page.action}` : ""}</small>
              {page.questions.length ? <ul>{page.questions.slice(0, 8).map((question, index) => <li key={index} className={question.answered ? "answered" : "unanswered"}>
                {question.answered ? <Check /> : <X />}<span>{question.prompt}{question.answered && question.answer ? `: ${question.answer}` : ""}</span>
              </li>)}</ul> : null}
            </li>)}</ol>
          </details> : null}
        </div> : <div className="automation-ready"><Sparkles /><span><strong>Ready for one-click completion</strong><small>Approve once. Progress and the final result appear here while you stay in Receipt Relay.</small></span></div>}
        <button className="danger-link" disabled={busy} onClick={onDelete}><Trash2 /> Delete receipt and images</button>
      </aside>
    </div>
  </div>;
}

function confidenceClass(value: number) { return value >= 0.85 ? "high" : value >= 0.65 ? "medium" : "low"; }
function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function automationTitle(job: AutomationJob) {
  if (job.status === "completed") return job.dryRun ? "Practice run finished" : "Survey completed";
  if (job.status === "needs_attention") return "Survey needs an answer";
  if (job.status === "failed") return "Survey could not finish";
  if (job.status === "running") return "Completing survey…";
  return "Survey queued";
}
