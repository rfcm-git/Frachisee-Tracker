// Browser checks against the production build, using the installed Microsoft Edge.
//   npm run build && npm run e2e            -> all routes + flows
//   node scripts/e2e.mjs --only=dashboard  -> one route by name
//   node scripts/e2e.mjs --only=intro      -> just the 3D intro checks
// Writes screenshots to scripts/out/ and exits non-zero if any check fails.
import { preview } from "vite";
import { chromium } from "playwright-core";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const INTRO_ONLY = only === "intro";
const ROUTES = process.env.FLOWS_ONLY || INTRO_ONLY ? [] : [
  { path: "/", name: "dashboard", ready: "text=Stores to watch" },
  { path: "/issues", name: "issues", ready: "role=table" },
  { path: "/issues/ISS-1203", name: "issue-detail", ready: "role=dialog" },
  { path: "/stores", name: "stores", ready: "role=table" },
  { path: "/stores/s3", name: "store-profile", ready: "text=Platform performance" },
  { path: "/settings/platforms", name: "platforms", ready: "text=Alert thresholds" },
  { path: "/settings/users", name: "users", ready: "role=table" },
  { path: "/terms", name: "terms", ready: "role=heading[name=/Acceptable use/]" },
  { path: "/nope", name: "not-found", ready: "text=This page doesn't exist" },
].filter((r) => !only || r.name === only);
if (!ROUTES.length && !process.env.FLOWS_ONLY && !INTRO_ONLY) throw new Error(`No route named "${only}"`);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const server = await preview({ preview: { port: 5287, strictPort: true }, logLevel: "error" });
const base = "http://localhost:5287";
// SwiftShader gives headless Edge software WebGL for the 3D intro.
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const failures = [];
const log = (...a) => console.log(...a);

// The 3D intro is switched off unless a test asks for it ({ intro: true }).
async function newPage(vp, { intro = false, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ...opts });
  if (!intro) await ctx.addInitScript(() => localStorage.setItem("opsTracker.intro.off", "1"));
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("fonts.g") && page.errors.push(m.text()));
  return page;
}

try {
  for (const vp of VIEWPORTS) {
    for (const r of ROUTES) {
      const page = await newPage(vp);
      await page.goto(base + r.path);
      // Skeletons should show while metrics load.
      if (r.name === "dashboard" && vp.name === "desktop") {
        const sk = await page.locator(".skeleton").count();
        if (!sk) failures.push("dashboard: no skeletons during load");
      }
      try {
        await page.locator(r.ready).first().waitFor({ timeout: 8000 });
      } catch {
        failures.push(`${r.name} @${vp.name}: never showed "${r.ready}"`);
        await page.context().close();
        continue;
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: fileURLToPath(new URL(`${r.name}-${vp.name}.png`, OUT)), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) failures.push(`${r.name} @${vp.name}: page scrolls sideways by ${overflow}px`);
      if (vp.name === "desktop" || r.name === "dashboard") {
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        for (const v of axe.violations) failures.push(`${r.name} @${vp.name} axe ${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      }
      if (page.errors.length) failures.push(`${r.name} @${vp.name} console: ${page.errors.join(" / ")}`);
      log(`checked ${r.name} @${vp.name}`);
      await page.context().close();
    }
  }

  if (!only) {
    const { runFlows } = await import("./flows.mjs");
    await runFlows({ newPage, base, failures, log, OUT });
  }
  if (!only || INTRO_ONLY) {
    const { runIntroFlows } = await import("./intro-flows.mjs");
    await runIntroFlows({ newPage, base, failures, log });
  }
} finally {
  await browser.close();
  await new Promise((res) => server.httpServer.close(res));
}

if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n- ` + failures.join("\n- "));
  process.exit(1);
}
console.log("\nAll browser checks passed.");
