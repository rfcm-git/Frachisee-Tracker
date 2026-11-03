// Key user flows, driven by keyboard where it matters. Called from e2e.mjs.
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

export async function runFlows({ newPage, base, failures, log }) {
  async function flow(name, vp, fn) {
    const page = await newPage(vp);
    try {
      await fn(page);
      if (page.errors.length) failures.push(`flow "${name}" console: ${page.errors.join(" / ")}`);
      log(`flow ok: ${name}`);
    } catch (e) {
      failures.push(`flow "${name}": ${e.message.split("\n").filter((l) => l.trim()).slice(0, 3).join(" | ")}`);
      await page.screenshot({ path: `scripts/out/FAILED-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
    } finally {
      await page.context().close();
    }
  }
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  await flow("flag issue with keyboard + validation", DESKTOP, async (page) => {
    await page.goto(base + "/");
    await page.getByText("Stores to watch").waitFor();
    await page.keyboard.press("n");
    const dialog = page.getByRole("dialog", { name: "Flag an issue" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Flag issue" }).click();
    await dialog.getByText("Choose the store this issue is for.").waitFor();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-invalid"));
    expect(focused === "true", "focus did not move to the first invalid field");
    await dialog.getByRole("combobox", { name: "Store" }).fill("Anaheim");
    await page.keyboard.press("Enter");
    await dialog.getByLabel("Platform").selectOption("ubereats");
    await dialog.getByLabel("Category").selectOption("Missing items");
    await dialog.getByLabel("Summary").fill("E2E test: drinks missing from order");
    await dialog.getByLabel("Severity").selectOption("critical");
    await dialog.getByLabel("Order ID").fill("ab12cd");
    await dialog.getByRole("button", { name: "Flag issue" }).click();
    await page.getByRole("status").filter({ hasText: "flagged" }).waitFor();
    expect(!(await dialog.isVisible()), "dialog stayed open after save");
    await page.getByRole("button", { name: "View issue" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByText("E2E test: drinks missing from order").waitFor();
    await drawer.getByText("#AB12CD").waitFor();
  });

  await flow("command palette jump to store", DESKTOP, async (page) => {
    await page.goto(base + "/issues");
    await page.getByRole("table").waitFor();
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search stores, issues and pages" }).fill("Torrance");
    await page.keyboard.press("Enter");
    await page.waitForURL("**/stores/s10");
    await page.getByText("Platform performance").waitFor();
    await page.getByRole("heading", { level: 1 }).getByText("Torrance").waitFor();
  });

  await flow("g-shortcuts and shortcut help", DESKTOP, async (page) => {
    await page.goto(base + "/");
    await page.getByText("Stores to watch").waitFor();
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await page.waitForURL("**/stores");
    await page.keyboard.press("?");
    await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  });

  await flow("issue rows: arrows, enter, resolve, esc returns focus", DESKTOP, async (page) => {
    await page.goto(base + "/issues");
    await page.getByRole("table").waitFor();
    const rows = page.locator("tbody tr[data-row]");
    const before = await rows.count();
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    const secondLabel = await rows.nth(1).getAttribute("aria-label");
    const activeLabel = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
    expect(activeLabel === secondLabel, "ArrowDown did not move to the next row");
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Mark resolved" }).click();
    await page.getByRole("status").filter({ hasText: "resolved" }).first().waitFor();
    await drawer.getByText("Changed status to Resolved").waitFor();
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    await page.waitForFunction((n) => document.querySelectorAll("tbody tr[data-row]").length === n - 1, before);
    const focusOnRow = await page.evaluate(() => document.activeElement?.tagName);
    // The resolved row leaves the Active list, so focus falls back to the page heading.
    expect(["TR", "H1"].includes(focusOnRow), `focus after close was ${focusOnRow}`);
  });

  await flow("issue filters and empty state", DESKTOP, async (page) => {
    await page.goto(base + "/issues");
    await page.getByRole("table").waitFor();
    await page.getByRole("searchbox", { name: "Search issues" }).fill("zzzz-nothing");
    await page.getByText("No issues match these filters").waitFor();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await page.getByRole("table").waitFor();
    await page.getByLabel("Platform", { exact: true }).selectOption("grubhub");
    expect(page.url().includes("platform=grubhub"), "filter not reflected in URL");
  });

  await flow("dashboard filters scope everything", DESKTOP, async (page) => {
    await page.goto(base + "/");
    await page.getByText("Stores to watch").waitFor();
    await page.getByRole("radio", { name: "30 days" }).click();
    await page.getByLabel("Platform", { exact: true }).selectOption("doordash");
    await page.waitForURL(/range=30.*platform=doordash|platform=doordash.*range=30/);
    await page.getByText("last 30 complete days").waitFor();
    // Single series: the legend box goes away (the title names the series).
    await page.waitForFunction(() => !document.querySelector("[aria-labelledby=trend-h] ul li"), null, { timeout: 5000 }).catch(() => {
      throw new Error("legend should be hidden for a single series");
    });
    await page.getByRole("button", { name: "Table" }).click();
    await page.getByRole("table", { name: "Daily orders by platform" }).waitFor();
    // Chart keyboard readout
    await page.getByRole("button", { name: "Chart" }).click();
    await page.getByRole("img", { name: "Daily orders by platform" }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("status").filter({ hasText: "DoorDash" }).waitFor();
  });

  await flow("platform settings validation + save", DESKTOP, async (page) => {
    await page.goto(base + "/settings/platforms");
    const dd = page.getByRole("region", { name: "DoorDash" });
    await dd.waitFor();
    await dd.getByLabel("Max order error rate (%)").fill("80");
    await dd.getByRole("button", { name: "Save DoorDash settings" }).click();
    await dd.getByText("Use a rate between 0.1% and 50%.").waitFor();
    await dd.getByLabel("Max order error rate (%)").fill("3");
    await dd.getByRole("button", { name: "Save DoorDash settings" }).click();
    await page.getByRole("status").filter({ hasText: "DoorDash settings saved" }).waitFor();
    // Disabling asks first
    await page.getByRole("switch", { name: "Track Grubhub" }).click();
    await page.getByRole("dialog", { name: "Stop tracking Grubhub?" }).getByRole("button", { name: "Keep tracking" }).click();
    expect(await page.getByRole("switch", { name: "Track Grubhub" }).getAttribute("aria-checked") === "true", "Grubhub was disabled without confirming");
  });

  await flow("invite user + menu keyboard", DESKTOP, async (page) => {
    await page.goto(base + "/settings/users");
    await page.getByRole("table").waitFor();
    await page.getByRole("button", { name: "Invite user" }).click();
    const d = page.getByRole("dialog", { name: "Invite a teammate" });
    await d.getByLabel("Full name").fill("Casey Morgan");
    await d.getByLabel("Work email").fill("priya.shah@example.com");
    await d.getByRole("button", { name: "Send invite" }).click();
    await d.getByText("Someone with this email is already on the team.").waitFor();
    await d.getByLabel("Work email").fill("casey.morgan@example.com");
    await d.getByRole("button", { name: "Send invite" }).click();
    await page.getByText("Casey Morgan", { exact: true }).waitFor();
    const trigger = page.getByRole("button", { name: "Actions for Casey Morgan" });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("menuitem", { name: "Resend invite" }).waitFor();
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    expect(back === "Actions for Casey Morgan", "Esc did not return focus to the menu button");
  });

  await flow("user menu top right", DESKTOP, async (page) => {
    await page.goto(base + "/");
    await page.getByRole("button", { name: "Account and team settings" }).click();
    await page.getByRole("menuitem", { name: "Terms of service" }).click();
    await page.waitForURL("**/terms");
  });

  await flow("mobile navigation", MOBILE, async (page) => {
    await page.goto(base + "/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByRole("link", { name: "Issues" }).click();
    await page.waitForURL("**/issues");
    await nav.waitFor({ state: "detached" });
  });

  await flow("store profile flag prefills store", DESKTOP, async (page) => {
    await page.goto(base + "/stores/s3");
    await page.getByText("Platform performance").waitFor();
    await page.getByRole("button", { name: "Flag issue" }).last().click();
    const v = await page.getByRole("dialog", { name: "Flag an issue" }).getByRole("combobox", { name: "Store" }).getAttribute("placeholder");
    expect(v.includes("Santa Ana"), `store not prefilled (${v})`);
  });
}
