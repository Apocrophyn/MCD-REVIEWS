import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { PlaywrightSurveyAutomator, type SurveyAutomationPayload } from "../server/survey/automation.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const payload: SurveyAutomationPayload = {
  receipt: {
    store: "Oxford Road",
    visitedAt: "2026-09-04T12:30:00.000Z",
    orderNumber: "42",
    surveyCode: "123456789012",
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
    const result = await new PlaywrightSurveyAutomator(url, true).run(payload, (value) => progress.push(value));
    expect(result).toMatchObject({ outcome: "completed" });
    expect(progress).toContain(100);
  }, 20_000);

  it("stops instead of guessing an unknown required answer", async () => {
    const url = await serve(`<!doctype html><html><body><div class="question"><h2>Choose an unknown preference</h2><input required></div><button>Continue</button></body></html>`);
    const result = await new PlaywrightSurveyAutomator(url, true).run(payload, () => undefined);
    expect(result).toMatchObject({ outcome: "needs_attention" });
    expect(result.message).toMatch(/could not be matched/i);
  }, 10_000);

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
          document.body.innerHTML = values === '1234|5678|9012|10|50'
            ? '<h1>Thank you for completing the survey</h1>'
            : '<div class="question"><h2>Entry values were not mapped correctly</h2><input required></div><button>Continue</button>';
        };
      </script>
    </body></html>`);
    const result = await new PlaywrightSurveyAutomator(url, true).run(payload, () => undefined);
    expect(result).toMatchObject({ outcome: "completed" });
  }, 10_000);
});
