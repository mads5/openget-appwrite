/**
 * Launch Chromium with iPhone 12 viewport, smoke-test key routes, save screenshots.
 * Run from repo root: npx playwright install chromium && node scripts/mobile-sim-test.mjs
 */
import { chromium, devices } from "playwright";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../mobile-sim-output");

const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const paths = ["/", "/repos", "/contributors", "/donate", "/enterprise"];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 12"],
});
const page = await context.newPage();

const results = [];
for (const route of paths) {
  const url = `${base}${route}`;
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const ok = res && res.ok();
    const title = await page.title();
    const vw = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    const name =
      route === "/" ? "home" : route.replace(/\//g, "_").replace(/^_/, "") || "home";
    const shot = path.join(outDir, `mobile-sim-${name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    results.push({ path: route, ok, status: res?.status(), title, viewport: vw, screenshot: shot });
  } catch (e) {
    results.push({ path: route, error: String(e.message || e) });
  }
}

await browser.close();

console.log(JSON.stringify({ base, results }, null, 2));
process.exit(results.some((r) => r.error || r.ok === false) ? 1 : 0);
