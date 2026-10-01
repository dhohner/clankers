// Run with TO_PRD_PLAYWRIGHT_MODULE pointing to an installed playwright package.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TO_PRD_PLAYWRIGHT_MODULE || "playwright");
const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(resolve(tmpdir(), "prd-conversation-"));
const session = resolve(scratch, "session");
const log = resolve(scratch, "browser.log");
const registry = resolve(scratch, "interview-sessions.json");
const interviewEnv = {
  ...process.env,
  TO_PRD_INTERVIEW_BROWSER_LOG: log,
  TO_PRD_INTERVIEW_REGISTRY: registry,
};
await mkdir(session);
const questions = Array.from({ length: 4 }, (_, index) => ({
  node: `NODE-0${index + 1}`,
  label: ["Storage", "Sources", "Timing", "Scope"][index],
  question: index === 0 ? "Where should <b>answers</b> live?" : `Decide ${index + 1}.`,
  multi_select: index === 1,
  options: [
    { label: "Local", description: "Keep it on this machine.", recommended: true },
    { label: "Shared", description: "Share with collaborators." },
  ],
}));
const roundFile = resolve(scratch, "round.json");
await writeFile(roundFile, JSON.stringify({ id: "ROUND-01", questions }));
const ask = spawn("python3", ["-m", "scripts", "interview", "ask", session, roundFile], {
  cwd: skill,
  env: interviewEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let errors = "";
ask.stdout.on("data", (chunk) => { output += chunk; });
ask.stderr.on("data", (chunk) => { errors += chunk; });
async function checkResponsiveLayout(page, widths, screenshotPrefix) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(scratch, `${screenshotPrefix}-${width}.png`), fullPage: true });
  }
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.TO_PRD_CHROMIUM_EXECUTABLE });
  let url;
  for (let i = 0; i < 100; i++) {
    try { url = (await readFile(log, "utf8")).trim().split("\n").at(-1); } catch {}
    if (url) break;
    if (ask.exitCode !== null) throw new Error(`ask failed: ${errors} ${output}`);
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(url, "interview opens a page");
  const registered = JSON.parse(await readFile(registry, "utf8"));
  assert.deepEqual(registered.sessions.map((entry) => entry.session), [await realpath(session)],
    "the interview uses its scratch registry");
  const page = await browser.newPage();
  const faults = [];
  page.on("pageerror", (error) => faults.push(error.message));
  if (process.env.INTERVIEW_SCRIPT_OVERRIDE) {
    await page.route("**/assets/interview/app.js", (route) => route.fulfill({
      path: process.env.INTERVIEW_SCRIPT_OVERRIDE, contentType: "text/javascript",
    }));
  }
  let posts = 0;
  page.on("request", (request) => { if (request.method() === "POST") posts++; });
  await page.goto(url);
  await page.locator(".question").first().waitFor();
  assert.equal(await page.locator(".question:visible").count(), 1, "only one prompt is shown");
  assert.equal(await page.locator("h1").textContent(), "Project interview");
  assert.equal(await page.locator("h1 em").count(), 0);
  assert.equal(await page.locator(".interview-lede").textContent(),
    "Answer each question, then review and submit the round.");
  assert.equal(await page.locator(".question-head").first().evaluate((heading) =>
    getComputedStyle(heading).alignItems), "baseline", "question index and label share a baseline");
  assert.equal(await page.locator(".question-text").first().textContent(), questions[0].question);
  assert.equal(await page.locator(".question-text b").count(), 0);
  const loadedFonts = await page.evaluate(async () => {
    const weights = [400, 500, 600];
    return Promise.all(weights.map(async (weight) =>
      (await document.fonts.load(`${weight} 16px Manrope`)).length));
  });
  assert.ok(loadedFonts.every((count) => count > 0), "Manrope loads at every used weight");
  const fontFamilies = await page.locator("body, h1, .brand-name, .doc-status-word, .round-label, .question-count, .question-label, .question-text, .choice-label, textarea, button, summary").evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).fontFamily));
  assert.ok(fontFamilies.every((family) => family.startsWith("Manrope")), "Manrope is used throughout");
  assert.equal(await page.locator(".field-written:visible").count(), 0);
  assert.equal(await page.locator(".reply-send").textContent(), "Next question");
  assert.equal(await page.getByRole("button", { name: "Next question", exact: true }).isDisabled(), true);

  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowX), "clip");
    assert.ok(await page.locator("h1").evaluate((heading) =>
      parseFloat(getComputedStyle(heading).fontSize) <= 48), "compact interview heading");
    await page.screenshot({ path: resolve(scratch, `conversation-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.ok((await page.locator(".reply-send").boundingBox()).y < 756, "reply action fits the laptop viewport");
  await page.getByRole("radio", { name: /Write my own/ }).check();
  await page.locator(".question:visible").getByLabel("Written answer").fill("Keep <script>literal text</script> locally.");
  await page.locator(".question-extra summary").first().click();
  await page.getByLabel("Note (optional)", { exact: true }).first().fill("Preserve this note.");
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  assert.equal(await page.locator(".conversation-turn").count(), 1);
  assert.equal(await page.locator(".conversation-turn:visible").count(), 0,
    "previous answers are collapsed while answering");
  await page.locator(".conversation-history summary").click();
  assert.equal(await page.locator(".conversation-turn:visible").count(), 1);
  assert.equal(await page.locator(".conversation-reply script").count(), 0);
  await page.getByRole("checkbox", { name: /Local/ }).check();
  await page.getByRole("checkbox", { name: /Shared/ }).check();
  await page.reload();
  await page.getByRole("checkbox", { name: /Local/ }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /Local/ }).isChecked(), true);
  assert.equal(await page.getByRole("checkbox", { name: /Shared/ }).isChecked(), true);
  assert.equal(await page.locator(".conversation-turn").count(), 1);
  assert.equal(await page.locator(".conversation-turn:visible").count(), 0,
    "restored replies stay collapsed");
  await checkResponsiveLayout(page, [375, 1280], "active-question");
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  assert.equal(await page.locator(".conversation-turn:visible").count(), 0);
  assert.ok(await page.locator(".question:visible").evaluate((question) =>
    question.getBoundingClientRect().top < document.querySelector(".conversation-history").getBoundingClientRect().top),
  "the current question comes before previous answers");
  await page.getByRole("radio", { name: "Decide later", exact: true }).check();
  assert.equal(await page.getByRole("button", { name: "Next question", exact: true }).isDisabled(), true);
  await page.locator(".question:visible").getByLabel(/Why decide later/).fill("Need research.");
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  await page.getByRole("radio", { name: "Out of scope", exact: true }).check();
  await page.locator(".question:visible").getByLabel(/Why is it out of scope/).fill("Another release.");
  await page.getByRole("button", { name: "Review answers", exact: true }).click();
  assert.equal(await page.locator(".question:visible").count(), 0);
  assert.equal(await page.locator(".conversation-turn:visible").count(), 4,
    "review opens all answers");
  assert.equal(posts, 0, "replies remain local before submission");
  await checkResponsiveLayout(page, [320, 375, 414, 768, 1280], "review");
  await page.getByRole("button", { name: "Edit reply: Storage", exact: true }).click();
  assert.equal(await page.locator(".conversation-turn:visible").count(), 0,
    "editing focuses on the selected question");
  await page.locator(".question:visible").getByLabel("Written answer").fill("Updated storage.");
  await page.getByRole("button", { name: "Review answers", exact: true }).click();
  await page.locator(".round-comment summary").click();
  await page.getByLabel("Comment on the round (optional)").fill("Round comment.");
  await page.reload();
  await page.getByRole("button", { name: "Submit round", exact: true }).waitFor();
  assert.equal(await page.locator(".conversation-turn").count(), 4);
  assert.equal(await page.getByLabel("Comment on the round (optional)").inputValue(), "Round comment.");
  let releaseSubmit;
  const submitGate = new Promise((done) => { releaseSubmit = done; });
  await page.route("**/api/answers", async (route) => {
    await submitGate;
    await route.fulfill({ status: 400, json: {
      faults: [{ path: "answers", message: "Rejected for test", fix: "Try again" }],
    } });
  });
  await page.getByRole("button", { name: "Submit round", exact: true }).click();
  await page.getByRole("button", { name: "Submitting…", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Edit reply: Storage", exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel("Comment on the round (optional)").isDisabled(), true);
  releaseSubmit();
  await page.getByText("The server rejected the submit.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Submit round", exact: true }).isEnabled(), true);
  assert.equal(await page.locator(".conversation-turn").count(), 4);
  await page.unroute("**/api/answers");
  const result = page.waitForResponse((response) => response.url().endsWith("/api/answers") && response.status() === 200);
  await page.getByRole("button", { name: "Submit round", exact: true }).click();
  await result;
  await page.locator(".past-round").waitFor();
  for (let i = 0; i < 100 && ask.exitCode === null; i++) {
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.equal(ask.exitCode, 0, "ask delivered the round");
  assert.ok(output.includes("status: answered"));
  const submitted = JSON.parse(await readFile(resolve(session, "interview/answers/ROUND-01.json"), "utf8"));
  assert.equal(submitted.answers[0].written, "Updated storage.");
  assert.equal(submitted.answers[0].note, "Preserve this note.");
  assert.deepEqual(submitted.answers[1].selected, ["Local", "Shared"]);
  assert.equal(submitted.answers[2].reason, "Need research.");
  assert.equal(submitted.answers[3].reason, "Another release.");
  assert.equal(submitted.comment, "Round comment.");
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  const nextFile = resolve(scratch, "next.json");
  await writeFile(nextFile, JSON.stringify({ id: "ROUND-02", questions: [questions[0]] }));
  const nextAsk = spawn("python3", ["-m", "scripts", "interview", "ask", session, nextFile], {
    cwd: skill, env: interviewEnv, stdio: "ignore",
  });
  try {
    await page.getByRole("radio", { name: /Local/ }).waitFor();
    await page.getByRole("radio", { name: /Local/ }).check();
    await page.getByRole("button", { name: "Review answers", exact: true }).click();
    execFileSync("python3", ["-m", "scripts", "interview", "end", session], { cwd: skill, env: interviewEnv, stdio: "ignore" });
    await page.getByText("Session ended", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit round", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Edit reply: Storage", exact: true }).isDisabled(), true);
  } finally { nextAsk.kill(); }
  assert.deepEqual(faults, []);
  assert.deepEqual(JSON.parse(await readFile(registry, "utf8")).sessions, [],
    "ending the interview removes its scratch registry entry");
  console.log(`Conversation coverage passed; screenshots: ${scratch}`);
} finally {
  await browser?.close();
  execFileSync("python3", ["-m", "scripts", "interview", "end", session], { cwd: skill, env: interviewEnv, stdio: "ignore" });
  ask.kill();
  // Keep screenshots for visual inspection; remove session files and its authentication token.
  await rm(session, { recursive: true, force: true });
  await rm(log, { force: true });
  await rm(registry, { force: true });
  await rm(`${registry}.lock`, { force: true });
}
