// Browser checks for the 3D intro. Called from e2e.mjs (or `node scripts/e2e.mjs --only=intro`).
import { AxeBuilder } from "@axe-core/playwright";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const INTRO = ".tpdi";

export async function runIntroFlows({ newPage, base, failures, log }) {
  async function flow(name, vp, opts, fn) {
    const page = await newPage(vp, { intro: true, ...opts });
    try {
      await fn(page);
      if (page.errors.length) failures.push(`intro "${name}" console: ${page.errors.join(" / ")}`);
      log(`intro ok: ${name}`);
    } catch (e) {
      failures.push(`intro "${name}": ${e.message.split("\n").filter((l) => l.trim()).slice(0, 3).join(" | ")}`);
      await page.screenshot({ path: `scripts/out/FAILED-intro-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
    } finally {
      await page.context().close();
    }
  }
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const focusedTag = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
  const appInert = (page) => page.evaluate(() => document.getElementById("root").firstElementChild?.hasAttribute("inert"));
  const sceneTime = (page) => page.evaluate((sel) => document.querySelector(sel)?.introScene?.time ?? null, INTRO);

  await flow("first visit: loader, focus, a11y, Esc skips", DESKTOP, {}, async (page) => {
    await page.goto(base + "/");
    const dialog = page.getByRole("dialog", { name: "3PD HELPDESK, MGBD" });
    await dialog.waitFor();
    expect(await appInert(page), "app behind the intro is not inert");
    expect((await focusedTag(page)).includes("tpdi-skip"), "Skip button isn't focused on open");
    const bar = page.getByRole("progressbar");
    expect((await bar.getAttribute("aria-valuenow")) !== null, "progressbar has no value");

    const axe = await new AxeBuilder({ page }).include(INTRO).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations) failures.push(`intro axe ${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

    // Focus stays inside the intro.
    await page.keyboard.press("Tab");
    expect((await page.evaluate(() => document.activeElement?.type)) === "checkbox", "Tab didn't move to the checkbox");
    await page.keyboard.press("Tab");
    expect((await focusedTag(page)).includes("tpdi-skip"), "Tab didn't wrap back to Skip");

    await page.locator(`${INTRO}.is-playing`).waitFor({ timeout: 60000 });
    expect((await bar.getAttribute("aria-valuenow")) === "100", "progress didn't reach 100 before playing");
    await page.waitForFunction((sel) => document.querySelector(sel)?.introScene?.time > 0.5, INTRO, { timeout: 30000 });

    await page.keyboard.press("Escape");
    await page.locator(INTRO).waitFor({ state: "detached", timeout: 3000 });
    expect(!(await appInert(page)), "app still inert after the intro");
    expect((await focusedTag(page)) === "main", `focus went to ${await focusedTag(page)}, expected main`);
    await page.getByText("Stores to watch").waitFor();

    // Same session: doesn't play again on reload.
    await page.reload();
    await page.getByText("Stores to watch").waitFor();
    expect((await page.locator(INTRO).count()) === 0, "intro replayed in the same session");
  });

  await flow("plays to the end and hands off (mobile)", MOBILE, {}, async (page) => {
    await page.goto(base + "/");
    await page.locator(`${INTRO}.is-playing`).waitFor({ timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 1, `intro scrolls sideways by ${overflow}px`);
    // ~10.5 s camera move + 1.8 s hold + fade; slower under software rendering.
    await page.locator(INTRO).waitFor({ state: "detached", timeout: 90000 });
    expect((await page.evaluate(() => sessionStorage.getItem("opsTracker.intro.seen"))) === "1", "not marked as seen");
    expect((await focusedTag(page)) === "main", "focus not on main after the intro");
  });

  await flow("don't show again, then Play intro from the menu", DESKTOP, {}, async (page) => {
    await page.goto(base + "/");
    await page.locator(INTRO).waitFor();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: /Skip intro/ }).click();
    await page.locator(INTRO).waitFor({ state: "detached" });
    expect((await page.evaluate(() => localStorage.getItem("opsTracker.intro.off"))) === "1", "preference not saved");

    // A new tab (new session) respects the preference.
    const page2 = await page.context().newPage();
    await page2.goto(base + "/");
    await page2.getByText("Stores to watch").waitFor();
    expect((await page2.locator(INTRO).count()) === 0, "intro showed despite 'Don't show again'");

    await page2.getByRole("button", { name: "Account and team settings" }).click();
    await page2.getByRole("menuitem", { name: "Play intro" }).click();
    await page2.locator(INTRO).waitFor();
    await page2.waitForFunction(() => document.activeElement?.classList.contains("tpdi-skip"));
    await page2.keyboard.press("Escape");
    await page2.locator(INTRO).waitFor({ state: "detached" });
  });

  await flow("reduced motion shows a still frame", DESKTOP, { reducedMotion: "reduce" }, async (page) => {
    await page.goto(base + "/");
    await page.locator(`${INTRO}.is-still.is-playing`).waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    expect((await sceneTime(page)) === 0, "scene is animating under reduced motion");
    await page.locator(INTRO).waitFor({ state: "detached", timeout: 10000 });
  });

  await flow("no WebGL: falls through to the site", DESKTOP, {}, async (page) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : orig.call(this, type, ...rest);
      };
    });
    await page.goto(base + "/");
    await page.locator(INTRO).waitFor({ state: "detached", timeout: 15000 });
    await page.getByText("Stores to watch").waitFor();
  });

  await flow("standalone page (no React)", DESKTOP, {}, async (page) => {
    await page.goto(base + "/intro.html?intro=1");
    await page.locator(`${INTRO}.is-playing`).waitFor({ timeout: 60000 });
    await page.keyboard.press("Escape");
    await page.locator(INTRO).waitFor({ state: "detached" });
    expect((await focusedTag(page)) === "main", "focus not on main");
  });
}
