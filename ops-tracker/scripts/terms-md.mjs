// Regenerates docs/TERMS-OF-SERVICE.md from src/pages/terms.js (the /terms page).
import { writeFileSync } from "node:fs";
import { TERMS, TERMS_META } from "../src/pages/terms.js";

let md = `# 3PD Ops Tracker: Terms of Service (internal use)\n\n> **${TERMS_META.version}, pending legal/HR review.** Last updated ${TERMS_META.updated}. Owner: ${TERMS_META.owner}.\n> Generated from \`src/pages/terms.js\` (the in-app /terms page). Edit that file, then re-run \`npm run terms\`.\n\n`;
TERMS.forEach((s, i) => {
  md += `## ${i + 1}. ${s.title}\n\n` + s.body.map((p) => p + "\n\n").join("");
});
writeFileSync(new URL("../docs/TERMS-OF-SERVICE.md", import.meta.url), md.trimEnd() + "\n");
console.log("docs/TERMS-OF-SERVICE.md updated");
