import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightSurveyAutomator, type SurveyAutomationPayload } from "../server/survey/automation.js";

const servers: http.Server[] = [];
const proofDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-relay-proofs-"));
const automator = (url: string) => new PlaywrightSurveyAutomator({ proofDir, surveyUrl: url, headless: true, pacing: "fast" });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const payload: SurveyAutomationPayload = {
  receipt: {
    store: "Oxford Road",
    visitedAt: "2026-09-04T12:30:00.000Z",
    orderNumber: "42",
    surveyCode: "MKYWZM3NL9VG",
    total: 10.5,
    items: [{ quantity: 1, name: "Medium Fries" }],
  },
  experience: {
    attributes: ["service"],
    satisfaction: 5,
    notes: "The team welcomed me.",
    employeeId: null,
    attributeRatings: { service: 5 },
    recommendLikelihood: 9,
    returnIntent: 5,
    orderType: "takeaway",
    hadProblem: false,
    contactEmail: "person@example.com",
    acceptSurveyTerms: true,
  },
  feedback: "The counter team welcomed me and I was very satisfied.",
  dryRun: false,
};

async function serve(html: string) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(html);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  return `http://127.0.0.1:${address.port}/`;
}

describe("background survey browser", () => {
  it("fills multiple pages and submits after explicit approval", async () => {
    const url = await serve(`<!doctype html><html><body>
      <fieldset><legend>Enter your survey participation code</legend>
        <input required maxlength="4" aria-label="Code part 1">
        <input required maxlength="4" aria-label="Code part 2">
        <input required maxlength="4" aria-label="Code part 3">
      </fieldset>
      <button onclick="showQuestions()">Next</button>
      <script>
        function showQuestions() {
          document.body.innerHTML = '<fieldset><legend>Overall satisfaction</legend>' +
            [1,2,3,4,5].map(value => '<label><input required type="radio" name="overall" value="' + value + '"> ' + value + '</label>').join('') +
            '</fieldset><div class="question"><h2>Tell us additional feedback</h2><textarea required></textarea></div>' +
            '<fieldset><legend>I agree to the survey terms</legend><label><input required type="checkbox"> I agree</label></fieldset>' +
            '<button id="submit-survey">Submit survey</button>';
          document.getElementById('submit-survey').onclick = function () { document.body.innerHTML = '<h1>Thank you for completing the survey</h1>'; };
        }
      </script>
    </body></html>`);
    const progress: number[] = [];
    const result = await automator(url).run(payload, (value) => progress.push(value));
    expect(result).toMatchObject({ outcome: "completed" });
    expect(progress).toContain(100);
  }, 30_000);

  it("stops instead of guessing an unknown required answer", async () => {
    const url = await serve(`<!doctype html><html><body><div class="question"><h2>Choose an unknown preference</h2><input required></div><button>Continue</button></body></html>`);
    const result = await automator(url).run(payload, () => undefined);
    expect(result).toMatchObject({ outcome: "needs_attention" });
    expect(result.message).toMatch(/could not be matched/i);
  }, 30_000);

  it("fills the live Food for Thoughts split code and amount field layout", async () => {
    const url = await serve(`<!doctype html><html><body>
      <p>12 digit code on the top of your receipt:</p>
      <p>
        <label for="CN1">Input characters 1 through 4 of the survey code.</label><input id="CN1" name="CN1" maxlength="4">
        <label for="CN2">Input characters 5 through 8 of the survey code.</label><input id="CN2" name="CN2" maxlength="4">
        <label for="CN3">Input characters 9 through 12 of the survey code.</label><input id="CN3" name="CN3" maxlength="4">
      </p>
      <p>Amount spent:
        <label for="AmountSpent1">Input Amount Spent pounds.</label><input id="AmountSpent1" name="AmountSpent1" maxlength="3">
        <label for="AmountSpent2">Input Amount Spent pence.</label><input id="AmountSpent2" name="AmountSpent2" maxlength="2">
      </p>
      <input id="NextButton" type="submit" value="Start">
      <script>
        document.getElementById('NextButton').onclick = function (event) {
          event.preventDefault();
          const ids = ['CN1', 'CN2', 'CN3', 'AmountSpent1', 'AmountSpent2'];
          const values = ids.map(id => document.getElementById(id).value).join('|');
          document.body.innerHTML = values === 'MKYW|ZM3N|L9VG|10|50'
            ? '<h1>Thank you for completing the survey</h1>'
            : '<div class="question"><h2>Entry values were not mapped correctly</h2><input required></div><button>Continue</button>';
        };
      </script>
    </body></html>`);
    const result = await automator(url).run(payload, () => undefined);
    expect(result).toMatchObject({ outcome: "completed" });
  }, 30_000);
  it("never reports completion from wording on the entry page", async () => {
    // The exact regression: an entry page that mentions a thank-you and a
    // validation code used to be read as a finished survey, so a receipt was
    // marked completed without a single answer being submitted.
    const url = await serve(`<!doctype html><html><body>
      <h1>Thank you for eating at McDonald's</h1>
      <p>Tell us how we did and get a delicious deal. Your validation code is printed at the top of your receipt.</p>
      <p>
        <label for="CN1">Input characters 1 through 4 of the survey code.</label><input id="CN1" name="CN1" maxlength="4">
        <label for="CN2">Input characters 5 through 8 of the survey code.</label><input id="CN2" name="CN2" maxlength="4">
        <label for="CN3">Input characters 9 through 12 of the survey code.</label><input id="CN3" name="CN3" maxlength="4">
      </p>
      <input id="NextButton" type="submit" value="Start">
      <script>
        document.getElementById('NextButton').onclick = function (event) {
          event.preventDefault();
          document.body.innerHTML = '<h1>The code you entered is not valid</h1><div role="alert">That code is not valid or has expired.</div>';
        };
      </script>
    </body></html>`);
    const result = await automator(url).run(payload, () => undefined);
    expect(result.outcome).not.toBe("completed");
    expect(result.message).toMatch(/not valid|expired/i);
  }, 30_000);

  it("stops at the submit button during a practice run and submits nothing", async () => {
    const url = await serve(`<!doctype html><html><body>
      <fieldset><legend>Overall satisfaction</legend>
        ${[1, 2, 3, 4, 5].map((value) => `<label><input type="radio" name="overall" value="${value}"> ${value}</label>`).join("")}
      </fieldset>
      <button id="submit-survey">Submit</button>
      <script>
        document.getElementById('submit-survey').onclick = function () {
          document.body.innerHTML = '<h1>Thank you for completing the survey</h1>';
        };
      </script>
    </body></html>`);
    const result = await new PlaywrightSurveyAutomator({ proofDir, surveyUrl: url, headless: true, pacing: "fast" })
      .run({ ...payload, dryRun: true }, () => undefined);
    expect(result.outcome).toBe("dry_run_complete");
    expect(result.message).toMatch(/Nothing was submitted/);
    // A screenshot of the page it stopped on, and a record of what was asked.
    expect(result.proof).toBeTruthy();
    expect(result.transcript[0].questions.some((question) => question.answered)).toBe(true);
  }, 30_000);

  it("captures a screenshot of the thank-you page as proof of submission", async () => {
    const url = await serve(`<!doctype html><html><body>
      <fieldset><legend>Overall satisfaction</legend>
        ${[1, 2, 3, 4, 5].map((value) => `<label><input required type="radio" name="overall" value="${value}"> ${value}</label>`).join("")}
      </fieldset>
      <button id="submit-survey">Submit</button>
      <script>
        document.getElementById('submit-survey').onclick = function () {
          document.body.innerHTML = '<h1>Thank you for completing the survey</h1><p>Your validation code is 4821-9930</p>';
        };
      </script>
    </body></html>`);
    const result = await automator(url).run(payload, () => undefined);
    expect(result.outcome).toBe("completed");
    expect(result.message).toContain("4821-9930");
    expect(fs.existsSync(path.join(proofDir, result.proof!))).toBe(true);
  }, 30_000);
});
