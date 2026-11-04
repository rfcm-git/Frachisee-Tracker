# 3D intro: "3PD HELPDESK"

The intro is a short animated scene that plays before the site. The camera glides down a street past people and cars, then settles in front of a Subway store. As the camera turns toward the store, the sign on its roof lights up and spells out **3PD HELPDESK**, with **MGBD** below it. Then the intro fades into the site.

- Built with three.js. The engine loads only when the intro plays, so the site's own bundle doesn't grow.
- A loading screen shows a percentage while the models, the font and the site's data load.
- The intro has a Skip button, closes with `Esc`, and has a "Don't show the intro again" checkbox. It plays once per browser session by default.
- With "reduce motion" turned on, the intro shows a still frame instead of the animation. It falls back to the site if WebGL isn't available or anything fails to load.

## Files

| File | What it is |
|---|---|
| `src/intro/overlay.js` | `mountIntro()`: the overlay, loading screen, controls, keyboard handling and hand-off. Plain DOM, so it works on any page. |
| `src/intro/scene.js` | three.js: asset loading (`LoadingManager`, `GLTFLoader`, `FontLoader`), the scene, 3D text (`TextGeometry`), people and cars, and the camera move. Loaded with `import()`. |
| `src/intro/settings.js` | Default settings and the rules for when the intro plays. No three.js. |
| `src/intro/intro.css` | Overlay styles. Plain CSS; every class starts with `tpdi-`. |
| `src/intro/IntroGate.jsx` | React wrapper used by this app (`src/main.jsx`). |
| `intro.html`, `src/intro/standalone.js` | The same intro on a plain HTML page, without React. Open `/intro.html?intro=1`. |
| `public/intro/models/*.glb` | `store.glb`: the storefront and rooftop sign board. `street.glb`: road, sidewalks, neighboring buildings, trees, lights and props. `person.glb`: a walker with `Walk` and `Idle` clips. `car.glb`: a car. |
| `public/intro/fonts/montserrat-black.typeface.json` | Montserrat Black in three.js typeface format, cut down to A–Z, a–z, 0–9 and common punctuation. `OFL.txt` is its license. |
| `scripts/build-intro-assets.mjs` | Generates all of the above from code (`npm run intro:assets`). |

## How it plays

1. **Loading (0–100%).** The progress bar combines the 3D engine download, the five asset files (byte progress where the server reports sizes) and the site data from `preload()`.
2. **Camera move (10.5 s).** The shot starts high above the road and drops to street level beside the walkers. It then swings across and finishes square-on to the storefront. The rooftop lamps flicker on at about 6 s, each letter of the heading pops up in turn, and then MGBD appears.
3. **Hold (1.8 s) and hand-off.** The overlay fades out over 600 ms and focus moves to the page's `<main>`.

People and cars move the whole time. The cars are timed so none of them passes in front of the camera during the final shot.

## Settings

Pass overrides as `config` (React: `<IntroGate config={...}>`; plain JS: `mountIntro({ config })`). Defaults live in `src/intro/settings.js`.

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `frequency` | `"session"` | `"session"` plays once per browser tab session, `"always"` plays on every load, `"once"` plays on the first visit only |
| `autoHide` | `true` | Close on its own after the hold. When `false`, it stays on the last shot until the visitor skips. |
| `holdMs` | `1800` | How long the last shot is held before closing |
| `reducedMotion` | `"still"` | With "reduce motion" turned on, `"still"` shows the finished scene without movement and `"skip"` doesn't show the intro at all |
| `stillHoldMs` | `3500` | How long the still version stays up |
| `assetBase` | `"/intro/"` (`BASE_URL` + `intro/`) | Where `models/` and `fonts/` are served from |
| `heading`, `subheading`, `wordmark` | `"3PD HELPDESK"`, `"MGBD"`, `"SUBWAY"` | The 3D text. Text that's too wide is scaled down to fit the sign. |
| `description` | (scene description) | What screen readers hear as the dialog's description |

**Overrides for testing:**
- `?intro=1` forces the intro to play and `?intro=0` turns it off.
- The user menu's **Play intro** item replays it.
- In code, `playIntro()` from `settings.js` replays it.

**Stored state:**
- `localStorage["opsTracker.intro.off"] = "1"` records "don't show again". Clear it, or call `setIntroDisabled(false)`, to turn the intro back on.
- `sessionStorage["opsTracker.intro.seen"]` records that the intro has played this session.
- `localStorage["opsTracker.intro.seenOnce"]` records a first visit, for `frequency: "once"`.

## Putting it on another site

1. Copy `src/intro/` (`overlay.js`, `scene.js`, `settings.js`, `intro.css`) and `public/intro/`.
2. Install three.js: `npm install three`.
3. Mount it as early as possible:

```js
import { mountIntro } from "./intro/overlay.js";
import { shouldShowIntro } from "./intro/settings.js";

if (shouldShowIntro()) {
  mountIntro({
    config: { assetBase: "/intro/" },            // any overrides
    preload: () => fetch("/api/bootstrap"),      // optional: data the site needs first
    onFinish: (reason) => document.querySelector("main")?.focus(),
    // reason: "complete" | "skip" | "error" | "unsupported"
  });
}
```

The overlay is `position: fixed` at the top of the stacking order and stops the page scrolling while it's open. Give `<main>` `tabindex="-1"` so focus can land there afterwards. If you aren't using Vite, set `assetBase` explicitly, because the default reads `import.meta.env.BASE_URL`.

In React, wrap the app in `<IntroGate preload={fn}>`, as `src/main.jsx` does. The app renders underneath with `inert` set until the intro ends, so its data loads during the intro. Define `preload` and `config` at module level so they keep the same reference between renders.

## Swapping in real models

The models in this repo are generated stand-ins: low-poly, untextured, under 350 KB in total. To use real ones, export glTF binary (`.glb`) files to `public/intro/models/` with the same file names. The runtime depends on these names:

| Model | Must contain |
|---|---|
| `store.glb` | Empty nodes `Anchor_Wordmark`, `Anchor_Heading` and `Anchor_Subheading`, where the 3D text is centered. `Anchor_SignLight` holds the sign's light. Optionally a material named `SignLamp`, which is lit during the reveal. The store front faces +Z and sits on a sidewalk at y = 0.15 m. |
| `person.glb` | Animation clips `Walk` (one stride cycle, about 1.4 m at 1×) and `Idle`. The figure faces +Z with feet at y = 0. Materials named `Shirt`, `Pants`, `Skin` and `Hair` are recolored for each person. |
| `car.glb` | The car faces +X. Meshes named `Wheel_*` spin. A material named `CarPaint` is recolored for each car. |
| `street.glb` | Anything. Meshes whose names contain `Asphalt`, `Concrete`, `Curb`, `Grass`, `ParkingLot` or `Paint` receive shadows but don't cast them. |

Keep real models light:
- Merge static meshes per material.
- Keep each texture at 1024 px or smaller, and compress textures with KTX2.
- Consider Draco or Meshopt compression; `GLTFLoader` needs the matching decoder registered.

To use the official **Subway logo** instead of the 3D wordmark:
1. Model the logo into `store.glb` on the fascia.
2. Set `wordmark: ""` in the config.

The current wordmark is the word SUBWAY set in Montserrat. It isn't the official logo artwork, which needs to come from Subway brand assets.

To use a different font for the 3D text:
1. Point `buildFont()` in `scripts/build-intro-assets.mjs` at another TTF.
2. Run `npm run intro:assets`.

The script keeps only the characters listed in `CHARSET`.

## Accessibility

- The intro is a modal dialog labelled "3PD HELPDESK, MGBD". Its description is a plain-language account of the scene, and the canvas is hidden from screen readers.
- Focus starts on **Skip intro**. `Tab` cycles between the checkbox and Skip, and `Esc` skips.
- The page behind is `inert` while the intro is open. When it closes, focus moves to `<main>`.
- The loading bar is a `progressbar` with a live value. A polite live region announces when the intro starts.
- With "reduce motion" turned on, the intro shows a still frame and uses no fades, zooms or slides; set `reducedMotion: "skip"` to show nothing instead. The intro has no flashing beyond a brief lamp flicker, which is skipped in the still version.
- The controls sit over a dark gradient for contrast and have 44 px touch targets and visible focus rings. They support Windows forced-colors mode.

## Performance

- **Download:**
  - Models and font: about 360 KB (store 68 KB, street 209 KB, person 38 KB, car 24 KB, font 27 KB).
  - three.js chunk: about 170 KB gzipped.
  - Overlay code and CSS: about 5 KB gzipped, in the main bundle.
- **Draw calls:** about 350–480 per frame on desktop, mostly from the 17 people's separate limbs. Static scenery is merged to one mesh per material.
- **Device tiers:** `detectQuality()` treats touch devices, 4 or fewer CPU cores, or 4 GB or less of memory as "low". On low tier, there are 8 walkers instead of 14, shadows are off, antialiasing is off and pixel ratio is capped at 1.25. On high tier, the pixel ratio cap is 2.
- **Runtime:**
  - The frame step is capped, so slow frames slow the move rather than make it jump.
  - The timer pauses while the tab is hidden.
  - On close, every geometry and material is disposed and the WebGL context is released.

## Testing

`npm run e2e` includes the intro checks; `node scripts/e2e.mjs --only=intro` runs them alone, in headless Edge with software WebGL:

- **First visit:** the overlay opens with focus on Skip and the app behind it inert, an axe WCAG 2.2 AA scan passes, focus stays inside, progress reaches 100%, `Esc` skips, focus moves to `<main>`, and a reload in the same session doesn't replay it.
- **Full run on a phone-sized screen:** nothing scrolls sideways, the intro closes on its own and is marked as seen, and focus moves to `<main>`.
- **"Don't show again":** the setting is respected in a new tab, and **Play intro** in the user menu replays it.
- **Reduced motion:** a still frame shows and closes on its own.
- **No WebGL:** the intro falls through to the site.
- **Standalone page:** `intro.html` works.

The other route checks turn the intro off through `localStorage`, so it doesn't sit over the pages they test.

## Dependencies and licenses

| What | Used for | License |
|---|---|---|
| `three` | Rendering, glTF loading, 3D text | MIT |
| Montserrat Black (`@expo-google-fonts/montserrat`, dev only) | Source of the 3D font | SIL Open Font License 1.1 (`public/intro/fonts/OFL.txt`) |
| `opentype.js` (dev only) | TTF to typeface conversion | MIT |

## Known limitations

- The store, people and cars are simple generated models, not production art, and the wordmark is not the official Subway logo.
- The animation was tested in Edge (Chromium) at desktop and phone sizes. It hasn't yet been checked on real phones, Safari or Firefox, or on low-end GPUs.
- Under software rendering (no GPU), the camera move runs slower than real time because the frame step is capped.
