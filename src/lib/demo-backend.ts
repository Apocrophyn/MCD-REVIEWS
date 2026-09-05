/**
 * Preview-only backend.
 *
 * Receipt Relay is local-first: the real app talks to an Express server that
 * owns SQLite, private image storage, Claude, and the Playwright survey worker.
 * None of that can run on static hosting, so the hosted interface preview
 * serves the same API shape from memory instead.
 *
 * This module is loaded only when the bundle is built with
 * VITE_PREVIEW_DEMO=1, which is set exclusively by the preview build. It is
 * absent from `npm run build`, so development and production can never fall
 * back to sample receipt data.
 */
import { setImageResolver } from "./api";
import type { AutomationJob, Employee, Experience, Receipt, ReceiptItem } from "../types";

const now = () => new Date().toISOString();
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const id = () => crypto.randomUUID();

const receiptSvg = (store: string, code: string, lines: Array<[string, string]>, total: string) => {
  const rows = lines.map(([name, price], index) =>
    `<text x="34" y="${232 + index * 34}" font-size="19">1  ${name}</text>` +
    `<text x="366" y="${232 + index * 34}" font-size="19" text-anchor="end">${price}</text>`).join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <rect width="400" height="600" fill="#f4f1ea"/>
    <g font-family="ui-monospace, monospace" fill="#1d1b16">
      <text x="200" y="70" font-size="24" font-weight="700" text-anchor="middle">${store}</text>
      <text x="200" y="98" font-size="16" text-anchor="middle">12 High Street</text>
      <text x="34" y="150" font-size="16">Order #87321</text>
      <text x="366" y="150" font-size="16" text-anchor="end">Takeaway</text>
      <line x1="34" y1="176" x2="366" y2="176" stroke="#1d1b16" stroke-dasharray="4 5"/>
      ${rows}
      <line x1="34" y1="${252 + lines.length * 34}" x2="366" y2="${252 + lines.length * 34}" stroke="#1d1b16" stroke-dasharray="4 5"/>
      <text x="34" y="${290 + lines.length * 34}" font-size="21" font-weight="700">TOTAL</text>
      <text x="366" y="${290 + lines.length * 34}" font-size="21" font-weight="700" text-anchor="end">${total}</text>
      <text x="200" y="${356 + lines.length * 34}" font-size="15" text-anchor="middle">Survey code</text>
      <text x="200" y="${384 + lines.length * 34}" font-size="20" font-weight="700" text-anchor="middle">${code}</text>
      <text x="200" y="${430 + lines.length * 34}" font-size="15" text-anchor="middle">Thank you!</text>
    </g>
  </svg>`)}`;
};

const images = new Map<string, string>();

const makeImage = (receiptId: string, source: string, quality = { readable: true, fullReceipt: true, noGlare: true }) => {
  const imageId = id();
  images.set(`${receiptId}/${imageId}`, source);
  return { id: imageId, receiptId, mimeType: "image/jpeg", size: 412_000, quality: { ...quality, width: 1080, height: 1620, brightness: 168, message: "Looks clear" } };
};

const emptyExperience = (): Experience => ({
  attributes: [], satisfaction: 4, notes: "", employeeId: null, attributeRatings: {},
  recommendLikelihood: 8, returnIntent: 4, orderType: "takeaway", hadProblem: false, contactEmail: "", acceptSurveyTerms: false,
});

const items = (entries: Array<[string, number, number]>): ReceiptItem[] =>
  entries.map(([name, price, confidence]) => ({ id: id(), quantity: 1, name, normalizedName: name, price, confidence }));

function seedReceipt(store: string, code: string, status: Receipt["status"], minutes: number, lines: Array<[string, number, number]>, total: number): Receipt {
  const receiptId = id();
  const money = (value: number) => `£${value.toFixed(2)}`;
  return {
    id: receiptId,
    status,
    createdAt: minutesAgo(minutes),
    updatedAt: minutesAgo(minutes - 2),
    store,
    visitedAt: minutesAgo(minutes + 30),
    orderNumber: "87321",
    surveyCode: code,
    currency: "GBP",
    subtotal: Number((total / 1.2).toFixed(2)),
    tax: Number((total - total / 1.2).toFixed(2)),
    total,
    confidence: 0.94,
    items: items(lines),
    images: [makeImage(receiptId, receiptSvg(store, code.replace(/([A-Z0-9]{4})(?=[A-Z0-9])/g, "$1-"), lines.map(([name, price]) => [name, money(price)]), money(total)))],
    experience: emptyExperience(),
    feedback: "",
    scheduledAt: null,
    archivedAt: null,
    failureReason: null,
    classification: { isReceipt: true, confidence: 0.96, reason: "A printed merchant document with line items and totals is visible.", evidence: ["merchant heading", "line items", "transaction total"] },
  };
}

const receipts: Receipt[] = [
  seedReceipt("Sunset Grill", "MKYWZM3NL9VG", "completed", 40, [["Big Mac Meal", 7.49, 0.96], ["Apple Pie", 2.51, 0.9]], 10),
  seedReceipt("Harbor Bistro", "QJ4CTB7XR2HD", "ready_for_confirmation", 1_500, [["Quarter Pounder", 6.29, 0.94], ["Fries", 1.79, 0.97], ["Latte", 2.2, 0.88]], 10.28),
  seedReceipt("Pine & Coast Cafe", "", "quality_review", 3_100, [], 0),
];
receipts[2].confidence = 0.42;
receipts[2].images = [makeImage(receipts[2].id, receiptSvg("Pine & Coast Cafe", "unreadable", [["? ? ?", "?"]], "?"), { readable: false, fullReceipt: true, noGlare: false })];
receipts[2].classification = null;
receipts[2].store = "";

const employees: Employee[] = [
  { id: id(), name: "Taylor", role: "Counter team", createdAt: minutesAgo(4_000) },
  { id: id(), name: "Priya", role: "Shift manager", createdAt: minutesAgo(9_000) },
  { id: id(), name: "Marcus", role: "Kitchen", createdAt: minutesAgo(20_000) },
];

const jobs = new Map<string, AutomationJob>();

const find = (receiptId: string) => receipts.find((receipt) => receipt.id === receiptId);
const sorted = () => [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function draftFeedback(receipt: Receipt, experience: Experience): string {
  const claims = [`I rated my visit to ${receipt.store || "this restaurant"} ${experience.satisfaction} out of 5.`];
  const employee = employees.find((candidate) => candidate.id === experience.employeeId);
  if (employee) claims.push(`${employee.name} was the team member I selected.`);
  if (experience.notes.trim()) claims.push(experience.notes.trim());
  return claims.join(" ");
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

async function handle(pathname: string, method: string, request: Request): Promise<Response> {
  const segments = pathname.replace(/^\/api\//, "").split("/");
  const body = async <T>(): Promise<T> => request.body ? (await request.json()) as T : ({} as T);

  if (pathname === "/api/health") {
    return ok({
      ok: true, aiProvider: "Interface preview", aiModel: "none", aiSource: "none",
      analysisEnabled: false, feedbackEnabled: false, visionSupported: false,
      surveyAutomator: "Interface preview", automationEnabled: false, showBrowser: false,
      maxUploadMb: 10, maxImages: 3,
    });
  }

  if (segments[0] === "employees") {
    if (method === "POST") {
      const input = await body<{ name: string; role: string }>();
      const employee: Employee = { id: id(), name: input.name, role: input.role, createdAt: now() };
      employees.unshift(employee);
      return ok({ employee });
    }
    const query = new URL(request.url, location.origin).searchParams.get("q")?.toLowerCase() ?? "";
    return ok({ employees: employees.filter((employee) => employee.name.toLowerCase().includes(query)).slice(0, 6) });
  }

  if (segments[0] === "automation" && segments[1] === "jobs") {
    const job = jobs.get(segments[2]);
    if (!job) return fail(404, "Job not found");
    return ok({ job });
  }

  if (segments[0] !== "receipts") return fail(404, "Not found");

  if (segments.length === 1) {
    if (method === "POST") {
      const form = await request.formData();
      const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
      const receiptId = id();
      const receipt: Receipt = {
        id: receiptId, status: "quality_review", createdAt: now(), updatedAt: now(),
        store: "", visitedAt: null, orderNumber: "", surveyCode: "", currency: "GBP",
        subtotal: null, tax: null, total: null, confidence: 0, items: [],
        images: files.map((file) => makeImage(receiptId, URL.createObjectURL(file))),
        experience: emptyExperience(), feedback: "", scheduledAt: null, archivedAt: null,
        failureReason: null, classification: null,
      };
      receipts.unshift(receipt);
      return ok({ receipt });
    }
    return ok({ receipts: sorted() });
  }

  const receipt = find(segments[1]);
  if (!receipt) return fail(404, "Receipt not found");
  const action = segments[2];

  if (method === "DELETE") {
    receipts.splice(receipts.indexOf(receipt), 1);
    return new Response(null, { status: 204 });
  }

  if (!action) {
    if (method === "PATCH") {
      Object.assign(receipt, await body<Partial<Receipt>>(), { updatedAt: now() });
      return ok({ receipt });
    }
    return ok({ receipt });
  }

  if (action === "analyze") {
    // The preview has no Claude, no server, and no OCR. Inventing an extraction
    // here is what made an unrelated photo look like a recognised receipt.
    if (!receipt.store) {
      receipt.status = "needs_attention";
      receipt.classification = null;
      receipt.failureReason = "The interface preview cannot read receipts. Run Receipt Relay locally and connect a model in Settings to analyse a real photo.";
      receipt.updatedAt = now();
      return ok({ receipt });
    }
    return ok({ receipt });
  }

  if (action === "feedback") {
    const experience = await body<Experience>();
    receipt.experience = experience;
    receipt.feedback = draftFeedback(receipt, experience);
    receipt.updatedAt = now();
    return ok({ receipt });
  }

  if (action === "approve") {
    receipt.status = "ready";
    receipt.updatedAt = now();
    return ok({
      receipt,
      preparation: { provider: "Interface preview", url: "https://www.mcdfoodforthoughts.com/", participationCode: receipt.surveyCode, instructions: "Preview only.", expiresGuidance: "Receipt codes usually expire 7 days after the visit." },
    });
  }

  if (action === "automation") {
    if (segments[3] === "latest") {
      const latest = [...jobs.values()].filter((job) => job.receiptId === receipt.id).at(-1) ?? null;
      return ok({ job: latest });
    }
    // No browser exists in a static preview, so the job reports that instead of
    // pretending a survey was completed.
    const job: AutomationJob = {
      id: id(), receiptId: receipt.id, status: "needs_attention", progress: 0,
      message: "The interface preview has no background browser. Run Receipt Relay locally to complete a real survey.",
      createdAt: now(), updatedAt: now(), startedAt: now(), completedAt: now(),
      dryRun: false, proof: null, transcript: [],
    };
    jobs.set(job.id, job);
    return ok({ job });
  }

  if (action === "cancel") { receipt.status = "canceled"; receipt.updatedAt = now(); return ok({ receipt }); }
  if (action === "archive") { receipt.archivedAt = now(); receipt.updatedAt = now(); return ok({ receipt }); }
  if (action === "schedule") {
    receipt.scheduledAt = (await body<{ scheduledAt: string }>()).scheduledAt;
    receipt.status = "scheduled";
    return ok({ receipt });
  }
  if (action === "complete") { receipt.status = "completed"; receipt.updatedAt = now(); return ok({ receipt }); }

  return fail(404, "Not found");
}

function banner() {
  const style = document.createElement("style");
  style.textContent = `.preview-banner{position:fixed;z-index:200;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:999px;font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;background:rgba(16,23,40,.72);-webkit-backdrop-filter:blur(22px) saturate(180%);backdrop-filter:blur(22px) saturate(180%);box-shadow:0 12px 34px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.28);pointer-events:none}
.preview-banner i{width:7px;height:7px;border-radius:50%;background:#f2a20c;box-shadow:0 0 0 3px rgba(242,162,12,.28)}
@media (max-width:850px){.preview-banner{left:14px;right:14px;transform:none;justify-content:center;bottom:calc(max(12px, env(safe-area-inset-bottom)) + 82px);font-size:11px}
.app-shell .toast{bottom:calc(max(12px, env(safe-area-inset-bottom)) + 130px)}
.workflow-shell .toast{bottom:calc(max(12px, env(safe-area-inset-bottom)) + 62px)}
}`;
  document.head.append(style);
  const node = document.createElement("div");
  node.className = "preview-banner";
  node.setAttribute("role", "status");
  node.innerHTML = "<i></i><span>Interface preview — layout only. No receipt analysis and no survey submission.</span>";
  document.body.append(node);
}

export function installDemoBackend() {
  setImageResolver((receiptId, imageId) => images.get(`${receiptId}/${imageId}`) ?? "");
  const passthrough = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const { pathname } = new URL(request.url, location.origin);
    if (!pathname.startsWith("/api/")) return passthrough(input as RequestInfo, init);
    await new Promise((resolve) => setTimeout(resolve, 260));
    try { return await handle(pathname, request.method, request); }
    catch { return fail(500, "Preview request failed"); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner, { once: true });
  else banner();
}
