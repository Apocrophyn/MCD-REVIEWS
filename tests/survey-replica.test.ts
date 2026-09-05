import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightSurveyAutomator, type SurveyAutomationPayload } from "../server/survey/automation.js";

/**
 * A local replica of the real Food for Thoughts flow, rebuilt from the markup
 * observed during a supervised run against the live site: an SMG consent gate,
 * the split code/amount entry page, matrix questions whose rows carry the
 * question and whose column headers carry the answer, and a final thank-you
 * page bearing a validation code.
 *
 * The live host rate-limits automated sessions, so this stands in for the last
 * stretch of the survey and lets completion detection, submission proof, and
 * practice-run behaviour be verified without loading a third party's servers.
 */

const servers: http.Server[] = [];
const proofDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-relay-replica-"));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const payload: SurveyAutomationPayload = {
  receipt: {
    store: "McDonald's, 518/522 Wickham Road, Croydon",
    visitedAt: "2026-09-04T16:39:00.000Z",
    orderNumber: "076",
    surveyCode: "MKYW-ZM3N-L9VG",
    total: 13.27,
    items: [{ quantity: 1, name: "Medium Fries" }],
  },
  experience: {
    attributes: ["food_quality", "service", "cleanliness", "wait_time"],
    satisfaction: 5,
    notes: "",
    employeeId: null,
    attributeRatings: { food_quality: 5, service: 5, cleanliness: 5, wait_time: 4 },
    recommendLikelihood: 9,
    returnIntent: 5,
    orderType: "takeaway",
    hadProblem: false,
    contactEmail: "",
    acceptSurveyTerms: true,
  },
  feedback: "The food was hot and the team were friendly.",
  dryRun: false,
};

const shell = (body: string) => `<!doctype html><html><head><title>McDonald’s Food for Thoughts</title></head>
<body><h1>McDonald’s Food for Thoughts</h1>${body}</body></html>`;

/** The live grid: a shared scale in the header row, one statement per row. */
const matrix = (heading: string, rows: Array<[string, string]>) => `
<h2>${heading}</h2>
<table>
  <tr><th></th><th>Highly Satisfied</th><th>Satisfied</th><th>Neither Satisfied Nor Dissatisfied</th><th>Dissatisfied</th><th>Highly Dissatisfied</th></tr>
  ${rows.map(([name, label]) => `<tr><td>${label}</td>${[5, 4, 3, 2, 1].map((value) =>
    `<td><label>&zwj;<input type="radio" name="${name}" value="${value}"></label></td>`).join("")}</tr>`).join("")}
</table>`;

const nextButton = '<input type="submit" id="NextButton" name="NextButton" value="Next">';

function replica() {
  let posted: Record<string, string> = {};
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const fields = Object.fromEntries(new URLSearchParams(raw));
      posted = { ...posted, ...fields };
      const step = Number(fields.step ?? "0");
      const send = (body: string) => {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(shell(body));
      };
      const page = (inner: string, nextStep: number) =>
        send(`<form method="post" action="/Survey.aspx"><input type="hidden" name="step" value="${nextStep}">${inner}${nextButton}</form>`);

      if (request.method === "GET") {
        return page('<h2>Welcome to this survey</h2><p>This survey is operated by Service Management Group Limited ("SMG").</p><input type="submit" id="NextButton" value="Continue">', 1);
      }
      if (step === 1) {
        // Entry page: three code segments and a split amount, as the live site has.
        return send(`<form method="post" action="/Survey.aspx"><input type="hidden" name="step" value="2">
          <p>12 digit code on the top of your receipt:</p>
          <label for="CN1">Input characters 1 through 4 of the survey code.</label><input id="CN1" name="CN1" maxlength="4">
          <label for="CN2">Input characters 5 through 8 of the survey code.</label><input id="CN2" name="CN2" maxlength="4">
          <label for="CN3">Input characters 9 through 12 of the survey code.</label><input id="CN3" name="CN3" maxlength="4">
          <p>Amount spent:</p>
          <label for="AmountSpent1">Input Amount Spent pounds, euros or dollars.</label><input id="AmountSpent1" name="AmountSpent1" maxlength="3">
          <label for="AmountSpent2">Input Amount Spent pence or cents.</label><input id="AmountSpent2" name="AmountSpent2" maxlength="2">
          <input type="submit" id="NextButton" value="Start"></form>`);
      }
      if (step === 2) {
        // The live site rejects a wrong code here, so the replica does too.
        if (posted.CN1 !== "MKYW" || posted.CN2 !== "ZM3N" || posted.CN3 !== "L9VG" || posted.AmountSpent1 !== "13" || posted.AmountSpent2 !== "27") {
          return send('<h2>The code you entered is not valid</h2><div role="alert">That code is not valid or has expired.</div>');
        }
        return page('<fieldset><legend>What was your visit type?</legend>' +
          '<label><input type="radio" name="visit" value="1"> Dined in at restaurant</label>' +
          '<label><input type="radio" name="visit" value="2"> Collected at counter to take away</label></fieldset>', 3);
      }
      if (step === 3) return page(matrix("", [["R000002", "Please rate your overall satisfaction with your experience at this McDonald’s"]]), 4);
      if (step === 4) {
        return page(matrix("Please rate your satisfaction with...", [
          ["R000016", "The ease of placing your order."],
          ["R000020", "The cleanliness of the restaurant."],
          ["R000011", "The friendliness of the staff."],
          ["R000144", "How well your order was packaged."],
          ["R000009", "The speed of service."],
        ]), 5);
      }
      if (step === 5) {
        return page('<fieldset><legend>How likely are you to recommend this restaurant?</legend>' +
          Array.from({ length: 11 }, (_, value) => `<label><input type="radio" name="nps" value="${value}"> ${value}</label>`).join("") +
          "</fieldset>", 6);
      }
      if (step === 6) {
        return send(`<form method="post" action="/Survey.aspx"><input type="hidden" name="step" value="7">
          <div class="question"><h2>Please tell us more about your visit</h2><textarea name="comments"></textarea></div>
          <input type="submit" id="NextButton" value="Submit"></form>`);
      }
      // Only reachable once every page above was answered and submitted.
      const answered = ["visit", "R000002", "R000016", "R000020", "R000011", "R000144", "R000009", "nps"].every((key) => posted[key]);
      return send(answered
        ? '<h2>Thank you for completing the survey</h2><p>Your validation code is 4821-9930-1174</p>'
        : '<h2>Some answers are missing</h2><div role="alert">Please answer every question.</div>');
    });
  });
  servers.push(server);
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Replica did not bind");
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

const automator = (url: string) => new PlaywrightSurveyAutomator({ proofDir, surveyUrl: url, headless: true, pacing: "fast" });

describe("Food for Thoughts replica", () => {
  it("completes the whole survey and captures the thank-you page as proof", async () => {
    const url = await replica();
    const progress: number[] = [];
    const result = await automator(url).run(payload, (value) => progress.push(value));

    expect(result.outcome).toBe("completed");
    expect(result.message).toContain("4821-9930-1174");
    expect(progress).toContain(100);

    // The proof screenshot exists and has real pixels in it.
    expect(result.proof).toBeTruthy();
    expect(fs.statSync(path.join(proofDir, result.proof!)).size).toBeGreaterThan(1_000);

    // Every grid row was answered from the confirmed ratings, not guessed.
    const grid = result.transcript.find((page) => page.questions.some((question) => /speed of service/i.test(question.prompt)))!;
    expect(grid.questions.every((question) => question.answered)).toBe(true);
    expect(grid.questions.map((question) => question.answer)).toContain("Highly Satisfied");
    expect(grid.questions.find((question) => /speed of service/i.test(question.prompt))?.answer).toBe("Satisfied");
    expect(result.transcript.some((page) => page.actionKind === "submit")).toBe(true);
  }, 60_000);

  it("stops a practice run at the submit button, leaving the survey unfinished", async () => {
    const url = await replica();
    const result = await automator(url).run({ ...payload, dryRun: true }, () => undefined);

    expect(result.outcome).toBe("dry_run_complete");
    expect(result.message).toMatch(/Nothing was submitted/);
    // It reached the last page but never posted it, so no validation code exists.
    expect(result.transcript.at(-1)?.actionKind).toBe("submit");
    expect(result.message).not.toContain("4821-9930-1174");
    expect(result.proof).toBeTruthy();
  }, 60_000);

  it("reports the site's rejection instead of inventing a completion", async () => {
    const url = await replica();
    const result = await automator(url).run({ ...payload, receipt: { ...payload.receipt, surveyCode: "AAAABBBBCCCC" } }, () => undefined);

    expect(result.outcome).toBe("needs_attention");
    expect(result.message).toMatch(/not valid|expired/i);
  }, 60_000);
});
