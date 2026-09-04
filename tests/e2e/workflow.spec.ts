import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { test, expect } from "@playwright/test";

let fixturePath = "";
let randomPhotoPath = "";

test.beforeAll(async ({}, workerInfo) => {
  fixturePath = path.resolve(`.context/e2e-receipt-${workerInfo.project.name}.jpg`);
  randomPhotoPath = path.resolve(`.context/e2e-random-${workerInfo.project.name}.jpg`);
  const width = 800;
  const height = 1200;
  const data = Buffer.alloc(width * height * 3);
  const nonce = Date.now() % 100;
  for (let index = 0; index < width * height; index += 1) {
    const line = Math.floor(index / width);
    const value = index < 10 ? nonce : line % 50 < 11 ? (workerInfo.project.name === "chromium" ? 30 : 38) : 238;
    data[index * 3] = value;
    data[index * 3 + 1] = value;
    data[index * 3 + 2] = value;
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).jpeg().toFile(fixturePath);
  const randomData = Buffer.alloc(width * height * 3);
  const projectBias = workerInfo.project.name === "chromium" ? 0 : 7;
  for (let index = 0; index < width * height; index += 1) {
    const bright = Math.floor(index / width) % 60 < 30;
    randomData[index * 3] = bright ? 235 - projectBias : 80 + projectBias;
    randomData[index * 3 + 1] = bright ? 95 : 15;
    randomData[index * 3 + 2] = bright ? 55 : 10;
  }
  await sharp(randomData, { raw: { width, height, channels: 3 } }).jpeg().toFile(randomPhotoPath);
});

test.afterAll(() => {
  fs.rmSync(fixturePath, { force: true });
  fs.rmSync(randomPhotoPath, { force: true });
});

test("rejects a random non-receipt photo without fake extraction", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("gallery-input").setInputFiles(randomPhotoPath);
  await page.getByRole("button", { name: "Classify & read receipt" }).click();
  await expect(page.getByRole("heading", { name: "This doesn’t look like a receipt" })).toBeVisible();
  await expect(page.getByText("High Street Restaurant")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose another image" })).toBeVisible();
  await page.getByRole("button", { name: "Choose another image" }).click();
  await expect(page.getByRole("heading", { name: "Turn a receipt into useful feedback." })).toBeVisible();
});

test("runs the survey in the background without leaving Receipt Relay", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Turn a receipt into useful feedback." })).toBeVisible();
  await page.getByTestId("gallery-input").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "Check your photo" })).toBeVisible();
  await expect(page.getByText("Readable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Classify & read receipt" }).click();
  await expect(page.getByRole("heading", { name: "Confirm receipt" })).toBeVisible();
  await expect(page.locator("#store")).toHaveValue("High Street Restaurant");
  await expect(page.locator("#survey")).toHaveValue("123456789012");
  await expect(page.locator("#total")).toHaveValue("10.00");
  await page.getByRole("button", { name: "Service", exact: true }).click();
  await page.getByLabel("What happened?").fill("The counter team welcomed me.");
  await page.getByRole("checkbox", { name: /Run the official survey for me/ }).check();
  await page.getByRole("button", { name: "Approve & run survey" }).click();
  await expect(page.getByRole("heading", { name: "Survey completed" })).toBeVisible();
  await expect(page.locator(".completed-action")).toHaveText("Survey completed");
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Food for Thoughts survey completed in the background")).toBeVisible();
  await expect(page.getByText(/completed successfully/i)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Delete receipt and images/ }).click();
  await expect(page.getByRole("heading", { name: "Turn a receipt into useful feedback." })).toBeVisible();
});
