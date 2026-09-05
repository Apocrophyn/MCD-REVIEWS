/**
 * Supervised practice run against the live Food for Thoughts survey.
 *
 * Opens a visible Chrome window, fills every page from confirmed answers, and
 * stops at the submit button — nothing is submitted, so the receipt code stays
 * unused and can be spent on the real run later. Every page is screenshotted
 * and the questions are printed so the form structure can be reviewed.
 *
 *   npm run survey:dry-run -- --code MKYW-ZM3N-L9VG --total 13.27
 *   npm run survey:dry-run -- --code ... --total ... --submit   (really submits)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { normalizeSurveyCode, isValidSurveyCode } from "../../server/domain/normalize.js";
import { PlaywrightSurveyAutomator, type SurveyAutomationPayload } from "../../server/survey/automation.js";

function flag(name: string, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
}

const code = normalizeSurveyCode(flag("code"));
const total = Number(flag("total", "0"));
const dryRun = !process.argv.includes("--submit");
const outputDir = path.resolve(flag("out", ".context/survey-dry-run"));

if (!isValidSurveyCode(code)) {
  console.error("Pass the 12-character receipt code, for example: --code MKYW-ZM3N-L9VG");
  process.exit(1);
}
if (!Number.isFinite(total) || total <= 0) {
  console.error("Pass the amount spent, for example: --total 13.27");
  process.exit(1);
}

const payload: SurveyAutomationPayload = {
  receipt: {
    store: flag("store", "McDonald's, 518/522 Wickham Road, Croydon"),
    visitedAt: flag("visited", "") || null,
    orderNumber: flag("order", ""),
    surveyCode: code,
    total,
    items: [
      { quantity: 1, name: "Bacon & Cheese Crispy Chicken Medium Meal" },
      { quantity: 1, name: "4 Chicken McNuggets" },
      { quantity: 1, name: "Medium Fries" },
      { quantity: 1, name: "Sour Cherry Fizz" },
      { quantity: 1, name: "Mini Oreo McFlurry" },
    ],
  },
  experience: {
    attributes: ["food_quality", "service", "cleanliness", "wait_time", "value"],
    satisfaction: 5,
    notes: "",
    employeeId: null,
    attributeRatings: { food_quality: 5, service: 5, cleanliness: 5, wait_time: 4, value: 4 },
    recommendLikelihood: 9,
    returnIntent: 5,
    orderType: "takeaway",
    hadProblem: false,
    contactEmail: flag("email", ""),
    acceptSurveyTerms: true,
  },
  feedback: flag("feedback", "The food was hot and fresh, the counter team were friendly, and the restaurant was clean. I was served quickly and would happily come back."),
  dryRun,
};

fs.mkdirSync(outputDir, { recursive: true });

console.log(`\n${dryRun ? "PRACTICE RUN — nothing will be submitted" : "LIVE RUN — this WILL submit the survey"}`);
console.log(`Code ${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}   Amount £${total.toFixed(2)}`);
console.log(`Screenshots: ${outputDir}\n`);

const automator = new PlaywrightSurveyAutomator({ proofDir: outputDir, showBrowser: true, captureEveryPage: true });
const result = await automator.run(payload, (progress, message) => console.log(`  ${String(progress).padStart(3)}%  ${message}`));

console.log(`\nOutcome: ${result.outcome}`);
console.log(`${result.message}\n`);
console.log("Form structure seen on the way:\n");
for (const page of result.transcript) {
  console.log(`── Page ${page.index}: ${page.heading || "(no heading)"}`);
  console.log(`   ${page.url}`);
  console.log(`   filled ${page.filled}, unanswered required ${page.unansweredRequired}, next action: ${page.action ?? "none"} (${page.actionKind ?? "-"})`);
  for (const question of page.questions) {
    const mark = question.answered ? "✓" : "·";
    const options = question.options.length ? `  [${question.options.slice(0, 6).join(" | ")}${question.options.length > 6 ? " | …" : ""}]` : "";
    console.log(`   ${mark} (${question.kind}${question.required ? ", required" : ""}) ${question.prompt}${question.answered && question.answer ? ` → ${question.answer}` : ""}${options}`);
  }
  if (page.screenshot) console.log(`   screenshot: ${page.screenshot}`);
  console.log("");
}
fs.writeFileSync(path.join(outputDir, "transcript.json"), JSON.stringify(result, null, 2));
console.log(`Transcript written to ${path.join(outputDir, "transcript.json")}`);
