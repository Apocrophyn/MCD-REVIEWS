/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import fs from "node:fs";
import { chromium } from "playwright";
import type { Experience, Receipt } from "../domain/schemas.js";

export type SurveyAutomationOutcome = "completed" | "needs_attention";

export interface SurveyAutomationPayload {
  receipt: Pick<Receipt, "store" | "visitedAt" | "orderNumber" | "surveyCode" | "total"> & {
    items: Array<{ quantity: number; name: string }>;
  };
  experience: Experience;
  feedback: string;
}

export interface SurveyAutomationResult {
  outcome: SurveyAutomationOutcome;
  message: string;
}

export interface SurveyAutomator {
  readonly name: string;
  readonly available: boolean;
  run(payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult>;
}

export class PlaywrightSurveyAutomator implements SurveyAutomator {
  readonly name = "Background browser";
  get available() { return fs.existsSync(chromium.executablePath()); }

  constructor(
    private readonly surveyUrl = "https://www.mcdfoodforthoughts.com/",
    private readonly headless = false,
  ) {}

  async run(payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult> {
    onProgress(5, "Opening the official Food for Thoughts survey");
    const browser = await chromium.launch({
      headless: this.headless,
      args: this.headless ? [] : ["--window-position=-10000,-10000", "--window-size=1280,900"],
    });
    try {
      const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/London" });
      const page = await context.newPage();
      await page.goto(this.surveyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

      for (let step = 0; step < 30; step += 1) {
        await page.waitForTimeout(650);
        const state = await page.evaluate(fillSurveyPage, payload);
        if (state.securityChallenge) {
          return { outcome: "needs_attention", message: "The survey requested a security check. Receipt Relay did not attempt to bypass it." };
        }
        if (state.completed) {
          onProgress(100, "Survey completed successfully");
          return { outcome: "completed", message: "Food for Thoughts confirmed the survey was completed." };
        }

        onProgress(Math.min(92, 12 + step * 3), state.filled ? `Filled ${state.filled} answer${state.filled === 1 ? "" : "s"} on survey page ${step + 1}` : `Checking survey page ${step + 1}`);
        if (state.pageError) {
          return { outcome: "needs_attention", message: `The official survey reported: ${state.pageError}` };
        }
        if (state.unknownRequired > 0) {
          return { outcome: "needs_attention", message: "The survey contains a required question that could not be matched to a confirmed answer. Nothing was guessed." };
        }
        if (!state.action) {
          return { outcome: "needs_attention", message: "The survey page changed and no safe next action was recognized." };
        }

        await page.waitForTimeout(900);
        const clicked = await page.evaluate(clickSurveyAction, state.action);
        if (!clicked) return { outcome: "needs_attention", message: "The survey changed before the next safe action could be completed." };
        await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
      }
      return { outcome: "needs_attention", message: "The survey exceeded the safe page limit and was stopped." };
    } finally {
      await browser.close();
    }
  }
}

export class TestSurveyAutomator implements SurveyAutomator {
  readonly name = "Test background browser";
  readonly available = true;

  async run(_payload: SurveyAutomationPayload, onProgress: (progress: number, message: string) => void): Promise<SurveyAutomationResult> {
    onProgress(35, "Opening test survey");
    await new Promise((resolve) => setTimeout(resolve, 25));
    onProgress(80, "Filling confirmed test answers");
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { outcome: "completed", message: "Test survey completed successfully." };
  }
}

interface PageState {
  filled: number;
  unknownRequired: number;
  completed: boolean;
  securityChallenge: boolean;
  pageError: string | null;
  action: { kind: "next" | "submit"; label: string } | null;
}

function fillSurveyPage(payload: SurveyAutomationPayload): PageState {
  const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const visible = (element: Element) => {
    const control = element as HTMLInputElement;
    return !control.disabled && control.type !== "hidden" && element.getClientRects().length > 0;
  };
  const groupFor = (element: Element) => element.closest("fieldset, [role='radiogroup'], [role='group'], [class*='question' i], [id*='question' i], li") ?? element.parentElement;
  const questionText = (element: Element) => {
    const group = groupFor(element);
    const heading = group?.querySelector("legend, h1, h2, h3, h4, [class*='prompt' i], [class*='questiontext' i], [class*='question-text' i]");
    return normalize(`${heading?.textContent ?? ""} ${group?.textContent ?? ""}`.slice(0, 1_500));
  };
  const labelText = (element: Element) => {
    const control = element as HTMLInputElement;
    return normalize(`${control.labels?.[0]?.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${control.value ?? ""}`);
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
      const patterns: Record<string, RegExp> = { dine_in: /dine in|eat in|inside/, takeaway: /takeaway|take out|carry out/, drive_thru: /drive thru|drive through/, delivery: /deliver/, other: /other/ };
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
  const securityChallenge = /captcha|verify you are human|security check|access denied|unusual traffic/.test(bodyText);
  const completed = /thank you for (taking|completing)|survey (is )?complete|completed the survey|validation code|voucher code/.test(bodyText);
  if (securityChallenge || completed) return { filled: 0, unknownRequired: 0, completed, securityChallenge, pageError: null, action: null };

  const pageError = [...document.querySelectorAll<Element>(".Error, [role='alert'], [aria-invalid='true']")]
    .filter(visible)
    .map((element) => normalize(element.textContent || element.getAttribute("aria-label")))
    .find((message) => /error|please answer|invalid|not valid|expired|unable/.test(message))
    ?.slice(0, 240) ?? null;

  let filled = 0;
  const code = payload.receipt.surveyCode.replace(/[^a-z0-9]/gi, "");
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
    if (group && /survey code|invitation code|receipt code|participation code/.test(normalize(group.textContent))) codeGroups.add(group);
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

  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLAnchorElement>("button, input[type='button'], input[type='submit'], input[type='image'], a[role='button']")].filter(visible);
  const controlLabel = (control: HTMLInputElement | HTMLButtonElement | HTMLAnchorElement) => normalize(`${control.textContent ?? ""} ${(control as HTMLInputElement).value ?? ""} ${control.getAttribute("aria-label") ?? ""}`);
  const final = controls.find((control) => /^(submit|finish|send feedback|complete survey|done)(\s|$)/.test(controlLabel(control)));
  const next = controls.find((control) => /^(next|continue|start|begin)(\s|$)/.test(controlLabel(control)));
  const target = final ?? next;
  return { filled, unknownRequired, completed: false, securityChallenge: false, pageError, action: target ? { kind: final ? "submit" : "next", label: controlLabel(target) } : null };
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
