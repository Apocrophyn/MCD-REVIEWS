/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import type { Experience, Receipt } from "../domain/schemas.js";

export type SurveyAutomationOutcome = "completed" | "needs_attention" | "dry_run_complete";

export interface SurveyAutomationPayload {
  receipt: Pick<Receipt, "store" | "visitedAt" | "orderNumber" | "surveyCode" | "total"> & {
    items: Array<{ quantity: number; name: string }>;
  };
  experience: Experience;
  feedback: string;
  /** Fill every page, stop at the submit button, submit nothing. */
  dryRun: boolean;
}

export interface SurveyQuestionRecord {
  prompt: string;
  kind: "text" | "radio" | "checkbox" | "select" | "textarea";
  options: string[];
  answered: boolean;
  answer: string;
  required: boolean;
}

export interface SurveyPageRecord {
  index: number;
  url: string;
  heading: string;
  questions: SurveyQuestionRecord[];
  filled: number;
  unansweredRequired: number;
  action: string | null;
  actionKind: "next" | "submit" | null;
  screenshot: string | null;
}

export interface SurveyAutomationResult {
  outcome: SurveyAutomationOutcome;
  message: string;
  /** Screenshot of the final page — the user's proof the survey was submitted. */
  proof: string | null;
  transcript: SurveyPageRecord[];
}

export interface SurveyAutomatorOptions {
  /** Where page and proof screenshots are written. */
  proofDir: string;
  /** Show the Chromium window instead of parking it off-screen. */
  showBrowser?: boolean;
  surveyUrl?: string;
  /** Real runs stay headed; only tests against a local fixture opt into headless. */
  headless?: boolean;
  /** Capture every page, not just the final one. Used by the supervised test run. */
  captureEveryPage?: boolean;
  /** "fast" removes the think time. Only for local fixtures — never the live survey. */
  pacing?: "human" | "fast";
}

export interface SurveyAutomator {
  readonly name: string;
  readonly available: boolean;
  run(payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult>;
}

const MAX_PAGES = 40;

/** Human-scale think time. Slower than a bot, and far gentler on the survey host. */
const pause = (minimum: number, maximum: number) => new Promise<void>((resolve) => setTimeout(resolve, minimum + Math.random() * (maximum - minimum)));

export class PlaywrightSurveyAutomator implements SurveyAutomator {
  readonly name = "Background browser";
  get available() { return fs.existsSync(chromium.executablePath()); }

  constructor(private options: SurveyAutomatorOptions) {}

  /** Lets the Settings toggle take effect without restarting the server. */
  setShowBrowser(showBrowser: boolean) {
    this.options = { ...this.options, showBrowser };
  }

  async run(payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult> {
    const surveyUrl = this.options.surveyUrl ?? "https://www.mcdfoodforthoughts.com/";
    const headless = this.options.headless ?? false;
    const offscreen = !headless && !this.options.showBrowser;
    fs.mkdirSync(this.options.proofDir, { recursive: true, mode: 0o700 });
    const fast = this.options.pacing === "fast";
    const wait = (minimum: number, maximum: number) => fast ? pause(20, 60) : pause(minimum, maximum);

    onProgress(5, payload.dryRun ? "Opening the survey for a practice run" : "Opening the official Food for Thoughts survey");
    const browser = await chromium.launch({
      headless,
      args: offscreen ? ["--window-position=-10000,-10000", "--window-size=1280,900"] : ["--window-size=1280,900"],
      slowMo: this.options.showBrowser ? 120 : 0,
    });
    const transcript: SurveyPageRecord[] = [];

    try {
      const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/London", viewport: { width: 1280, height: 900 } });
      // The server runs through tsx, and esbuild's keepNames transform wraps
      // functions in a `__name` helper that does not exist in the browser.
      // Without this shim every page.evaluate below throws ReferenceError.
      await context.addInitScript(() => {
        const scope = globalThis as unknown as { __name?: (target: unknown) => unknown };
        scope.__name ??= (target) => target;
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(surveyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

      const capture = async (label: string) => {
        const fileName = `${randomUUID()}-${label}.png`;
        try {
          await page.screenshot({ path: path.join(this.options.proofDir, fileName), fullPage: true });
          return fileName;
        } catch {
          // A closed or crashed tab must not lose the result we already have.
          return null;
        }
      };

      // Food for Thoughts renders client-side and takes seconds to paint. Reading
      // the DOM too early sees an empty body and looks like an unknown page.
      const settle = async () => {
        await page.waitForLoadState("domcontentloaded", { timeout: 25_000 }).catch(() => undefined);
        await page.waitForFunction(
          () => Boolean(document.body)
            && (document.body.innerText.trim().length > 0 || document.querySelector("input, select, textarea, button") !== null),
          undefined,
          { timeout: 30_000 },
        ).catch(() => undefined);
        // The survey paints in stages, so let its own requests finish too.
        if (!fast) await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
        await wait(900, 1_800);
      };

      // The survey host occasionally drops a request mid-flow and Chromium shows
      // its own error page. Reloading the step is safe: nothing has been posted.
      const recoverIfBroken = async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const broken = page.url().startsWith("chrome-error")
            || await page.evaluate(() => /this page isn.t working|err_|took too long to respond/i.test(document.body?.innerText ?? "")).catch(() => false);
          if (!broken) return true;
          recoveries += 1;
          onProgress(0, `The survey did not respond. Waiting, then retrying the same page (attempt ${attempt + 1} of 2).`);
          await wait(8_000 * (attempt + 1), 12_000 * (attempt + 1));
          // Reloading would re-POST the request the host just rejected, so step
          // back to the last good page and let the loop answer and continue it.
          const recovered = await page.goBack({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
          if (!recovered) await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
          await settle();
        }
        return !page.url().startsWith("chrome-error");
      };

      let submitted = false;
      let pagesAdvanced = 0;
      let totalFilled = 0;
      let recoveries = 0;
      let lastGoodUrl = "";

      // The code and amount boxes drive ASP.NET validators on keystrokes, so they
      // are typed rather than assigned. Everything else is mapped in the DOM pass.
      const typeEntryFields = async () => {
        const code = payload.receipt.surveyCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
        const amount = payload.receipt.total?.toFixed(2).split(".") ?? null;
        const entries: Array<[string, string]> = [];
        if (code.length === 12) entries.push(["#CN1", code.slice(0, 4)], ["#CN2", code.slice(4, 8)], ["#CN3", code.slice(8, 12)]);
        if (amount) entries.push(["#AmountSpent1", amount[0]], ["#AmountSpent2", amount[1]]);
        let typed = 0;
        for (const [selector, value] of entries) {
          const field = page.locator(selector);
          if (!(await field.count()) || !(await field.isVisible().catch(() => false))) continue;
          if (await field.inputValue().catch(() => "x")) continue;
          await field.click({ timeout: 5_000 }).catch(() => undefined);
          await field.pressSequentially(value, { delay: fast ? 5 : 90 + Math.random() * 70 }).catch(() => undefined);
          // Leaving the field is what fires the page's own validators.
          await field.press("Tab").catch(() => undefined);
          typed += 1;
        }
        if (typed) await wait(600, 1_400);
        return typed;
      };

      for (let step = 0; step < MAX_PAGES; step += 1) {
        await settle();
        if (!(await recoverIfBroken())) {
          return { outcome: "needs_attention", message: "The official survey stopped responding and did not recover. Nothing was submitted; run it again later.", proof: await capture("survey-unreachable"), transcript };
        }
        // Recovering back onto the same page means the host is rejecting this
        // step, not glitching. Retrying further would only hammer it.
        if (recoveries >= 3 && page.url() === lastGoodUrl) {
          return {
            outcome: "needs_attention",
            message: "The official survey rejected the same page three times, which usually means it is rate-limiting automated sessions. Nothing was submitted; wait a while and run it again.",
            proof: await capture("survey-rejected"),
            transcript,
          };
        }
        lastGoodUrl = page.url();
        const typed = await typeEntryFields();
        const state = (await page.evaluate(fillSurveyPage, payload)) as PageState;
        state.filled += typed;
        totalFilled += state.filled;

        const record: SurveyPageRecord = {
          index: step + 1,
          url: page.url(),
          heading: state.heading,
          questions: state.questions,
          filled: state.filled,
          unansweredRequired: state.unknownRequired,
          action: state.action?.label ?? null,
          actionKind: state.action?.kind ?? null,
          screenshot: null,
        };
        if (this.options.captureEveryPage) record.screenshot = await capture(`page-${String(step + 1).padStart(2, "0")}`);
        transcript.push(record);

        if (state.securityChallenge) {
          return { outcome: "needs_attention", message: "The survey requested a security check. Receipt Relay did not attempt to bypass it.", proof: await capture("security-check"), transcript };
        }

        // Completion is only believable once we have actually worked through the
        // survey. Reading a stray "thank you" before a single answer was entered
        // is exactly how a survey that was never taken used to be reported done.
        if (state.completionEvidence && pagesAdvanced >= 1 && totalFilled > 0) {
          onProgress(100, "Survey completed successfully");
          return {
            outcome: "completed",
            message: state.completionCode
              ? `Food for Thoughts confirmed the survey was completed. Validation code: ${state.completionCode}`
              : `Food for Thoughts confirmed the survey was completed after ${totalFilled} confirmed answer${totalFilled === 1 ? "" : "s"}${submitted ? "" : " (the site finished without a separate submit step)"}.`,
            proof: await capture("thank-you"),
            transcript,
          };
        }

        onProgress(
          Math.min(92, 12 + step * 3),
          state.filled ? `Filled ${state.filled} answer${state.filled === 1 ? "" : "s"} on survey page ${step + 1}` : `Checking survey page ${step + 1}`,
        );

        if (state.pageError) {
          return { outcome: "needs_attention", message: `The official survey reported: ${state.pageError}`, proof: await capture("survey-error"), transcript };
        }
        if (state.unknownRequired > 0) {
          return {
            outcome: "needs_attention",
            message: `The survey asked ${state.unknownRequired} required question${state.unknownRequired === 1 ? "" : "s"} that could not be matched to a confirmed answer. Nothing was guessed.`,
            proof: await capture("needs-answer"),
            transcript,
          };
        }
        if (!state.action) {
          return { outcome: "needs_attention", message: "The survey page changed and no safe next action was recognized.", proof: await capture("unrecognized-page"), transcript };
        }

        if (payload.dryRun && state.action.kind === "submit") {
          onProgress(100, "Practice run reached the submit step and stopped");
          return {
            outcome: "dry_run_complete",
            message: `Practice run filled ${totalFilled} answer${totalFilled === 1 ? "" : "s"} across ${transcript.length} pages and stopped at "${state.action.label}". Nothing was submitted, so the receipt code is still unused.`,
            proof: await capture("stopped-before-submit"),
            transcript,
          };
        }

        // Read-then-answer-then-continue at a human rhythm rather than instantly.
        await wait(2_500, 5_500);
        const clicked = await page.evaluate(clickSurveyAction, state.action);
        if (!clicked) {
          return { outcome: "needs_attention", message: "The survey changed before the next safe action could be completed.", proof: await capture("action-lost"), transcript };
        }
        if (state.action.kind === "submit") submitted = true;
        pagesAdvanced += 1;
      }

      return { outcome: "needs_attention", message: "The survey exceeded the safe page limit and was stopped.", proof: await capture("page-limit"), transcript };
    } finally {
      await browser.close();
    }
  }
}

export class TestSurveyAutomator implements SurveyAutomator {
  readonly name = "Test background browser";
  readonly available = true;

  async run(payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult> {
    onProgress(35, "Opening test survey");
    await new Promise((resolve) => setTimeout(resolve, 25));
    onProgress(80, "Filling confirmed test answers");
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (payload.dryRun) {
      return { outcome: "dry_run_complete", message: "Test practice run stopped before submitting.", proof: null, transcript: [] };
    }
    return { outcome: "completed", message: "Test survey completed successfully.", proof: null, transcript: [] };
  }
}

interface PageState {
  heading: string;
  filled: number;
  unknownRequired: number;
  completionEvidence: boolean;
  completionCode: string | null;
  securityChallenge: boolean;
  pageError: string | null;
  action: { kind: "next" | "submit"; label: string } | null;
  questions: SurveyQuestionRecord[];
}

function fillSurveyPage(payload: SurveyAutomationPayload): PageState {
  const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const visible = (element: Element) => {
    const control = element as HTMLInputElement;
    return !control.disabled && control.type !== "hidden" && element.getClientRects().length > 0;
  };
  const groupFor = (element: Element) => element.closest("fieldset, [role='radiogroup'], [role='group'], [class*='question' i], [id*='question' i], li") ?? element.parentElement;

  // Food for Thoughts asks most questions as a grid: each row is a statement
  // ("The ease of placing your order.") and each column is a point on a shared
  // scale. Both live in table cells, so the control's own label is empty and
  // the row/column headers have to be read to know what is being asked.
  const cellOf = (element: Element) => element.closest("td, th");
  const rowLabel = (element: Element) => {
    const row = cellOf(element)?.closest("tr");
    const first = row?.querySelector("th, td");
    return first && !first.contains(element) ? normalize(first.textContent) : "";
  };
  const columnHeader = (element: Element) => {
    const cell = cellOf(element);
    const row = cell?.closest("tr");
    const table = row?.closest("table");
    if (!cell || !row || !table) return "";
    const index = [...row.children].indexOf(cell);
    if (index < 0) return "";
    for (const headerRow of [...table.querySelectorAll("tr")]) {
      if (headerRow === row || !headerRow.querySelector("th")) continue;
      const cells = [...headerRow.children];
      if (cells.length !== row.children.length) continue;
      const text = normalize(cells[index]?.textContent);
      if (text) return text;
    }
    return "";
  };
  const tableHeading = (element: Element) => {
    const table = element.closest("table");
    if (!table) return "";
    for (let node = table.previousElementSibling; node; node = node.previousElementSibling) {
      if (/^H[1-6]$/.test(node.tagName)) return normalize(node.textContent);
    }
    const heading = table.parentElement?.querySelector("h1, h2, h3, h4, legend");
    return heading ? normalize(heading.textContent) : "";
  };

  const questionText = (element: Element) => {
    const row = rowLabel(element);
    if (row) return normalize(`${tableHeading(element)} ${row}`);
    const group = groupFor(element);
    const heading = group?.querySelector("legend, h1, h2, h3, h4, [class*='prompt' i], [class*='questiontext' i], [class*='question-text' i]");
    return normalize(`${heading?.textContent ?? ""} ${group?.textContent ?? ""}`.slice(0, 1_500));
  };
  const labelText = (element: Element) => {
    const control = element as HTMLInputElement;
    const own = normalize(`${control.labels?.[0]?.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${control.value ?? ""}`);
    // Grid radios carry a zero-width label, so fall back to the column header.
    return own || columnHeader(element);
  };
  const fieldText = (element: Element) => {
    const control = element as HTMLInputElement;
    return normalize(`${questionText(element)} ${labelText(element)} ${control.placeholder ?? ""} ${control.name ?? ""} ${control.id ?? ""}`);
  };
  const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const choose = (element: HTMLInputElement) => {
    if (!element.checked) element.click();
  };
  const answerFor = (context: string) => {
    const ratings = payload.experience.attributeRatings ?? {};
    if (/recommend/.test(context)) return { type: "scale", value: payload.experience.recommendLikelihood, max: 10 } as const;
    if (/return|visit again|come back/.test(context)) return { type: "scale", value: payload.experience.returnIntent, max: 5 } as const;
    if (/problem|issue|something wrong/.test(context)) return { type: "boolean", value: payload.experience.hadProblem } as const;
    if (/order type|how did you order|visit type|dine/.test(context)) return { type: "orderType", value: payload.experience.orderType } as const;
    if (/clean/.test(context) && ratings.cleanliness) return { type: "scale", value: ratings.cleanliness, max: 5 } as const;
    if (/wait|speed|quick|timely/.test(context) && ratings.wait_time) return { type: "scale", value: ratings.wait_time, max: 5 } as const;
    if (/service|staff|crew|team member|friendly/.test(context) && ratings.service) return { type: "scale", value: ratings.service, max: 5 } as const;
    if (/food|meal|taste|temperature|quality/.test(context) && ratings.food_quality) return { type: "scale", value: ratings.food_quality, max: 5 } as const;
    if (/value|price/.test(context) && ratings.value) return { type: "scale", value: ratings.value, max: 5 } as const;
    if (/atmosphere|environment/.test(context) && ratings.atmosphere) return { type: "scale", value: ratings.atmosphere, max: 5 } as const;
    if (/overall|satisfied|satisfaction|experience/.test(context)) return { type: "scale", value: payload.experience.satisfaction, max: 5 } as const;
    return null;
  };
  const matchChoice = (elements: Array<HTMLInputElement | HTMLOptionElement>, answer: NonNullable<ReturnType<typeof answerFor>>) => {
    const choices = elements.map((element, index) => ({ element, index, text: labelText(element) }));
    if (answer.type === "boolean") return choices.find((choice) => answer.value ? /\byes\b/.test(choice.text) : /\bno\b/.test(choice.text))?.element ?? null;
    if (answer.type === "orderType") {
      const patterns: Record<string, RegExp> = { dine_in: /dine in|eat in|inside/, takeaway: /takeaway|take out|carry out|take away/, drive_thru: /drive thru|drive through/, delivery: /deliver/, other: /other/ };
      return choices.find((choice) => patterns[answer.value]?.test(choice.text))?.element ?? null;
    }
    const sentimentScore = (text: string) => {
      if (/excellent|highly satisfied|very satisfied|extremely satisfied|very good/.test(text)) return 5;
      if (/highly dissatisfied|very dissatisfied|extremely dissatisfied|very poor/.test(text)) return 1;
      if (/neither|neutral|average|okay|ok\b/.test(text)) return 3;
      if (/\bdissatisfied\b|\bpoor\b/.test(text)) return 2;
      if (/\bsatisfied\b|\bgood\b/.test(text)) return 4;
      return null;
    };
    const labelled = answer.max === 5 ? choices.find((choice) => sentimentScore(choice.text) === answer.value)?.element : null;
    if (labelled) return labelled;
    const numeric = choices.find((choice) => new RegExp(`(^|\\s)${answer.value}(\\s|$)`).test(choice.text));
    if (numeric) return numeric.element;
    if (choices.length === answer.max + 1 && answer.max === 10) return choices[answer.value]?.element ?? null;
    if (choices.length === answer.max) return choices[answer.value - 1]?.element ?? null;
    return null;
  };

  const bodyText = normalize(document.body?.innerText);
  const rawBody = document.body?.innerText ?? "";
  const heading = (document.querySelector("h1, h2, [class*='question' i]")?.textContent ?? document.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const securityChallenge = /captcha|verify you are human|security check|access denied|unusual traffic/.test(bodyText);

  // A finished survey has nothing left to answer. The entry page happily says
  // "thank you for eating at McDonald's" and mentions a validation code, which
  // is exactly how an untouched survey used to be read as finished.
  const answerableControls = [...document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='image']), select, textarea")].filter(visible);
  const completionWording = /thank you for (taking|completing|participating|filling)|thank you for your (time|feedback|participation)|your (validation|voucher|reward|discount) code is|survey (has been|is) complete|you have completed (the|this) survey|we appreciate you taking/.test(bodyText);
  const completionEvidence = completionWording && answerableControls.length === 0;
  const completionCode = completionEvidence
    ? (rawBody.match(/\b(?:validation|voucher|reward|discount)\s+code\D{0,20}([A-Z0-9][A-Z0-9-]{4,19})\b/i)?.[1] ?? null)
    : null;

  if (securityChallenge || completionEvidence) {
    return { heading, filled: 0, unknownRequired: 0, completionEvidence, completionCode, securityChallenge, pageError: null, action: null, questions: [] };
  }

  const pageError = [...document.querySelectorAll<Element>(".Error, [role='alert'], [aria-invalid='true']")]
    .filter(visible)
    .map((element) => normalize(element.textContent || element.getAttribute("aria-label")))
    .find((message) => /error|please answer|invalid|not valid|expired|unable/.test(message))
    ?.slice(0, 240) ?? null;

  let filled = 0;
  // UK Food for Thoughts codes are 12 alphanumeric characters (MKYW-ZM3N-L9VG),
  // not 12 digits. Uppercase them; the entry boxes reject lowercase.
  const code = payload.receipt.surveyCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const setKnownInput = (selector: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input || !visible(input) || input.value || !value) return;
    setValue(input, value);
    filled += 1;
  };

  // The live Food for Thoughts entry page uses three fixed code segments and
  // two fixed amount segments without native `required` attributes.
  if (code.length === 12) {
    setKnownInput("#CN1, input[name='CN1']", code.slice(0, 4));
    setKnownInput("#CN2, input[name='CN2']", code.slice(4, 8));
    setKnownInput("#CN3, input[name='CN3']", code.slice(8, 12));
  }
  if (payload.receipt.total != null) {
    const [major, minor] = payload.receipt.total.toFixed(2).split(".");
    setKnownInput("#AmountSpent1, input[name='AmountSpent1']", major);
    setKnownInput("#AmountSpent2, input[name='AmountSpent2']", minor);
  }

  const codeGroups = new Set<Element>();
  document.querySelectorAll("input:not([type='radio']):not([type='checkbox']):not([type='hidden']):not([type='button']):not([type='submit'])").forEach((input) => {
    const group = input.closest("fieldset, [role='group'], [class*='question' i], [id*='question' i]");
    if (group && /survey code|invitation code|receipt code|participation code|digit code|character code/.test(normalize(group.textContent))) codeGroups.add(group);
  });
  codeGroups.forEach((group) => {
    const inputs = [...group.querySelectorAll<HTMLInputElement>("input:not([type='radio']):not([type='checkbox']):not([type='hidden']):not([type='button']):not([type='submit'])")].filter((input) => visible(input) && !input.value);
    if (!code || inputs.length < 2 || inputs.length > 6) return;
    const explicitCapacity = inputs.reduce((sum, input) => sum + (input.maxLength > 0 ? input.maxLength : 0), 0);
    if (explicitCapacity > 0 && explicitCapacity < code.length) return;
    let offset = 0;
    inputs.forEach((input, index) => {
      const length = input.maxLength > 0 ? input.maxLength : Math.ceil((code.length - offset) / (inputs.length - index));
      const segment = code.slice(offset, offset + length);
      if (segment) { setValue(input, segment); filled += 1; }
      offset += length;
    });
  });

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type='radio']):not([type='checkbox']):not([type='hidden']):not([type='button']):not([type='submit']), textarea").forEach((element) => {
    if (!visible(element) || element.value) return;
    const context = fieldText(element);
    let value = "";
    const characterRange = context.match(/characters? (\d+) through (\d+)/);
    if (characterRange) value = code.slice(Number(characterRange[1]) - 1, Number(characterRange[2]));
    else if (/survey code|invitation code|receipt code|participation code/.test(context)) value = code;
    else if (/pounds|euros|dollars|whole amount/.test(context) && payload.receipt.total != null) value = Math.floor(payload.receipt.total).toString();
    else if (/pence|cents|decimal amount/.test(context) && payload.receipt.total != null) value = Math.round((payload.receipt.total % 1) * 100).toString().padStart(2, "0");
    else if (/amount|total|spent|purchase value/.test(context) && payload.receipt.total != null) value = Number(payload.receipt.total).toFixed(2);
    else if (/order number|order no|transaction number/.test(context)) value = payload.receipt.orderNumber;
    else if (/restaurant|store|location/.test(context)) value = payload.receipt.store;
    else if (/e mail|email/.test(context)) value = payload.experience.contactEmail;
    else if (/comment|feedback|tell us|describe|additional/.test(context)) value = payload.feedback;
    else if (element.type === "date" && payload.receipt.visitedAt) value = payload.receipt.visitedAt.slice(0, 10);
    else if (element.type === "time" && payload.receipt.visitedAt) value = payload.receipt.visitedAt.slice(11, 16);
    if (value) { setValue(element, value); filled += 1; }
  });

  const radioGroups = new Map<string, HTMLInputElement[]>();
  document.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach((radio) => {
    if (!visible(radio) || radio.checked) return;
    const key = radio.name || questionText(radio);
    radioGroups.set(key, [...(radioGroups.get(key) ?? []), radio]);
  });
  radioGroups.forEach((radios) => {
    const answer = answerFor(questionText(radios[0]));
    const match = answer && matchChoice(radios, answer);
    if (match instanceof HTMLInputElement) { choose(match); filled += 1; }
  });

  document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    if (!visible(select)) return;
    const selected = select.selectedOptions[0];
    if (select.value && !selected?.disabled && !/select|choose|please/.test(normalize(selected?.textContent))) return;
    const answer = answerFor(questionText(select));
    if (!answer) return;
    const match = matchChoice([...select.options].filter((option) => option.value), answer);
    if (match instanceof HTMLOptionElement) { select.value = match.value; select.dispatchEvent(new Event("change", { bubbles: true })); filled += 1; }
  });

  const itemNames = payload.receipt.items.map((item) => normalize(item.name));
  document.querySelectorAll<HTMLInputElement>("input[type='checkbox']").forEach((checkbox) => {
    if (!visible(checkbox) || checkbox.checked) return;
    const context = questionText(checkbox);
    if (/terms|privacy|agree|consent/.test(context) && payload.experience.acceptSurveyTerms) { choose(checkbox); filled += 1; return; }
    if (!/item|order|purchase|food|drink/.test(context)) return;
    const choice = labelText(checkbox);
    if (itemNames.some((item) => item.length > 2 && (choice.includes(item) || item.includes(choice)))) { choose(checkbox); filled += 1; }
  });

  const required = [...document.querySelectorAll<Element>("input[required], select[required], textarea[required], [aria-required='true']")].filter(visible);
  let unknownRequired = 0;

  const visibleRadioGroups = new Map<string, HTMLInputElement[]>();
  document.querySelectorAll<HTMLInputElement>("input[type='radio']").forEach((radio) => {
    if (!visible(radio)) return;
    const key = radio.name || questionText(radio);
    visibleRadioGroups.set(key, [...(visibleRadioGroups.get(key) ?? []), radio]);
  });
  visibleRadioGroups.forEach((radios) => {
    if (!radios.some((radio) => radio.checked)) unknownRequired += 1;
  });

  required.forEach((element) => {
    if (element instanceof HTMLInputElement && element.type === "radio") {
      return;
    } else if (element instanceof HTMLInputElement && element.type === "checkbox") {
      if (!element.checked) unknownRequired += 1;
    } else if (element instanceof HTMLSelectElement) {
      const selected = element.selectedOptions[0];
      if (!element.value || selected?.disabled || /select|choose|please/.test(normalize(selected?.textContent))) unknownRequired += 1;
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (!element.value.trim()) unknownRequired += 1;
    } else if (!element.querySelector("input:checked, option:checked:not([disabled])")) {
      unknownRequired += 1;
    }
  });

  // A readable record of what this page actually asked, so the form structure
  // can be reviewed after a practice run instead of guessed at.
  const questions: SurveyQuestionRecord[] = [];
  const seenPrompts = new Set<string>();
  const shorten = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 180);
  visibleRadioGroups.forEach((radios) => {
    const row = rowLabel(radios[0]);
    const prompt = row
      ? shorten(`${tableHeading(radios[0])} — ${row}`)
      : shorten(groupFor(radios[0])?.querySelector("legend, h1, h2, h3, h4")?.textContent ?? radios[0].name ?? "");
    const checked = radios.find((radio) => radio.checked);
    questions.push({
      prompt: prompt || "(unlabelled choice)",
      kind: "radio",
      options: radios.map((radio) => shorten(labelText(radio))).slice(0, 12),
      answered: Boolean(checked),
      answer: checked ? shorten(labelText(checked)) : "",
      required: true,
    });
  });
  document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    if (!visible(select)) return;
    questions.push({
      prompt: shorten(select.labels?.[0]?.textContent ?? select.name ?? select.id),
      kind: "select",
      options: [...select.options].map((option) => shorten(option.textContent ?? option.value)).slice(0, 12),
      answered: Boolean(select.value),
      answer: shorten(select.selectedOptions[0]?.textContent ?? ""),
      required: select.required,
    });
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type='radio']):not([type='checkbox']):not([type='hidden']):not([type='button']):not([type='submit']), textarea").forEach((element) => {
    if (!visible(element)) return;
    const prompt = shorten(element.labels?.[0]?.textContent ?? element.getAttribute("aria-label") ?? element.placeholder ?? element.name ?? element.id);
    const key = `${prompt}|${element.name}`;
    if (seenPrompts.has(key)) return;
    seenPrompts.add(key);
    questions.push({
      prompt: prompt || "(unlabelled field)",
      kind: element instanceof HTMLTextAreaElement ? "textarea" : "text",
      options: [],
      answered: Boolean(element.value.trim()),
      answer: shorten(element.value).slice(0, 60),
      required: element.required,
    });
  });

  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLAnchorElement>("button, input[type='button'], input[type='submit'], input[type='image'], a[role='button']")].filter(visible);
  const controlLabel = (control: HTMLInputElement | HTMLButtonElement | HTMLAnchorElement) => normalize(`${control.textContent ?? ""} ${(control as HTMLInputElement).value ?? ""} ${control.getAttribute("aria-label") ?? ""}`);
  const final = controls.find((control) => /^(submit|finish|send feedback|complete survey|done)(\s|$)/.test(controlLabel(control)));
  const next = controls.find((control) => /^(next|continue|start|begin)(\s|$)/.test(controlLabel(control)));
  const target = final ?? next;
  return {
    heading,
    filled,
    unknownRequired,
    completionEvidence: false,
    completionCode: null,
    securityChallenge: false,
    pageError,
    action: target ? { kind: final ? "submit" : "next", label: controlLabel(target) } : null,
    questions,
  };
}

function clickSurveyAction(action: { kind: "next" | "submit"; label: string }) {
  const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const visible = (element: Element) => !(element as HTMLInputElement).disabled && element.getClientRects().length > 0;
  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLAnchorElement>("button, input[type='button'], input[type='submit'], input[type='image'], a[role='button']")].filter(visible);
  const target = controls.find((control) => normalize(`${control.textContent ?? ""} ${(control as HTMLInputElement).value ?? ""} ${control.getAttribute("aria-label") ?? ""}`) === action.label);
  if (!target) return false;
  target.click();
  return true;
}
