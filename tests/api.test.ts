import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

let testDir: string;
let app: ReturnType<typeof createApp>["app"];
let repository: ReturnType<typeof createApp>["repository"];
let receiptId = "";

async function receiptFixture(seed = 0) {
  const width = 800;
  const height = 1200;
  const data = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const line = Math.floor(index / width);
    const value = index < 10 ? seed : line % 45 < 10 ? 35 : 235;
    data[index * 3] = value;
    data[index * 3 + 1] = value;
    data[index * 3 + 2] = value;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

async function nonReceiptFixture() {
  const width = 800;
  const height = 1200;
  const data = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const bright = Math.floor(index / width) % 60 < 30;
    data[index * 3] = bright ? 235 : 80;
    data[index * 3 + 1] = bright ? 95 : 15;
    data[index * 3 + 2] = bright ? 55 : 10;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-relay-test-"));
  const created = createApp({ config: loadConfig({ NODE_ENV: "test", DATA_DIR: testDir }) });
  app = created.app;
  repository = created.repository;
});

afterAll(() => {
  repository.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("receipt API lifecycle", () => {
  it("reports an isolated test provider", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toMatchObject({ ok: true, aiProvider: "Test AI", analysisEnabled: true, surveyAutomator: "Test background browser", automationEnabled: true, maxImages: 3 });
  });

  it("rejects a non-image upload", async () => {
    const response = await request(app).post("/api/receipts").attach("images", Buffer.from("hello"), { filename: "fake.png", contentType: "image/png" }).expect(400);
    expect(response.body.error).toMatch(/decoded|supported image/);
  });

  it("uploads, stores, and detects a duplicate by content", async () => {
    const fixture = await receiptFixture();
    const first = await request(app).post("/api/receipts").attach("images", fixture, { filename: "receipt.jpg", contentType: "image/jpeg" }).expect(201);
    receiptId = first.body.receipt.id;
    expect(first.body.receipt.images[0].quality.readable).toBe(true);
    const image = await request(app).get(`/api/receipts/${receiptId}/images/${first.body.receipt.images[0].id}`).expect(200);
    expect(image.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(image.body.length).toBeGreaterThan(1_000);
    const duplicate = await request(app).post("/api/receipts").attach("images", fixture, { filename: "copy.jpg", contentType: "image/jpeg" }).expect(409);
    expect(duplicate.body.duplicate.id).toBe(receiptId);
  });

  it("classifies poor images and supports multiple views of one receipt", async () => {
    const poor = await sharp({ create: { width: 400, height: 400, channels: 3, background: "white" } }).png().toBuffer();
    const poorResult = await request(app).post("/api/receipts").attach("images", poor, { filename: "poor.png", contentType: "image/png" }).expect(201);
    expect(poorResult.body.receipt.images[0].quality).toMatchObject({ readable: false, fullReceipt: false, noGlare: false });
    await request(app).delete(`/api/receipts/${poorResult.body.receipt.id}`).expect(204);

    const multiple = await request(app).post("/api/receipts")
      .attach("images", await receiptFixture(11), { filename: "top.jpg", contentType: "image/jpeg" })
      .attach("images", await receiptFixture(12), { filename: "bottom.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(multiple.body.receipt.images).toHaveLength(2);
    await request(app).delete(`/api/receipts/${multiple.body.receipt.id}`).expect(204);
  });

  it("rejects one side of a concurrent duplicate upload at the transaction boundary", async () => {
    const fixture = await receiptFixture(71);
    const results = await Promise.all([
      request(app).post("/api/receipts").attach("images", fixture, { filename: "race-a.jpg", contentType: "image/jpeg" }),
      request(app).post("/api/receipts").attach("images", fixture, { filename: "race-b.jpg", contentType: "image/jpeg" }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const created = results.find((response) => response.status === 201)!;
    await request(app).delete(`/api/receipts/${created.body.receipt.id}`).expect(204);
  });

  it("rejects a clear random photo without inventing receipt details", async () => {
    const uploaded = await request(app).post("/api/receipts")
      .attach("images", await nonReceiptFixture(), { filename: "random-photo.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(uploaded.body.receipt.images[0].quality.readable).toBe(true);

    const analyzed = await request(app).post(`/api/receipts/${uploaded.body.receipt.id}/analyze`).expect(200);
    expect(analyzed.body.receipt).toMatchObject({
      status: "needs_attention",
      store: "",
      surveyCode: "",
      items: [],
      classification: { isReceipt: false },
    });
    expect(analyzed.body.receipt.failureReason).toMatch(/receipt-like/i);
    await request(app).delete(`/api/receipts/${uploaded.body.receipt.id}`).expect(204);
  });

  it("extracts, edits, grounds feedback, and approves background completion", async () => {
    const analyzed = await request(app).post(`/api/receipts/${receiptId}/analyze`).expect(200);
    expect(analyzed.body.receipt.status).toBe("ready_for_confirmation");
    expect(analyzed.body.receipt.items.length).toBeGreaterThan(0);

    await request(app).patch(`/api/receipts/${receiptId}`).send({ store: "Oxford Road", surveyCode: "1234-5678-9012" }).expect(200);
    const employee = await request(app).post("/api/employees").send({ name: "Taylor", role: "Counter" }).expect(201);
    const experience = { attributes: ["service", "food_quality"], satisfaction: 5, notes: "The team welcomed me.", employeeId: employee.body.employee.id, acceptSurveyTerms: true, contactEmail: "person@example.com" };
    const generated = await request(app).post(`/api/receipts/${receiptId}/feedback`).send(experience).expect(200);
    expect(generated.body.receipt.feedback).toContain("Taylor");

    const approved = await request(app).post(`/api/receipts/${receiptId}/approve`).expect(200);
    expect(approved.body.receipt.status).toBe("ready");
    expect(approved.body.preparation.url).toBe("https://www.mcdfoodforthoughts.com/");
    expect(approved.body.preparation.instructions).toContain("background browser");
  });

  it("validates reminders before automation", async () => {
    await request(app).post(`/api/receipts/${receiptId}/schedule`).send({ scheduledAt: new Date(Date.now() - 60_000).toISOString() }).expect(400);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await request(app).post(`/api/receipts/${receiptId}/schedule`).send({ scheduledAt: future }).expect(200);
    expect(scheduled.body.receipt.scheduledAt).toBe(future);
  });

  it("runs the survey in the background and persists completion", async () => {
    const started = await request(app).post(`/api/receipts/${receiptId}/automation`).expect(202);
    expect(started.body.job).toMatchObject({ receiptId, status: "queued", progress: 0 });
    let job = started.body.job;
    for (let attempt = 0; attempt < 20 && job.status !== "completed"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      job = (await request(app).get(`/api/automation/jobs/${job.id}`).expect(200)).body.job;
    }
    expect(job).toMatchObject({ receiptId, status: "completed", progress: 100 });
    const latest = await request(app).get(`/api/receipts/${receiptId}/automation/latest`).expect(200);
    expect(latest.body.job.id).toBe(job.id);
    const receipt = await request(app).get(`/api/receipts/${receiptId}`).expect(200);
    expect(receipt.body.receipt.status).toBe("completed");
  });

  it("deletes database data and the private image", async () => {
    const receipt = repository.getReceipt(receiptId)!;
    const storedPath = path.join(testDir, "uploads", receipt.images[0].fileName);
    expect(fs.existsSync(storedPath)).toBe(true);
    await request(app).delete(`/api/receipts/${receiptId}`).expect(204);
    expect(repository.getReceipt(receiptId)).toBeNull();
    expect(fs.existsSync(storedPath)).toBe(false);
  });
});
