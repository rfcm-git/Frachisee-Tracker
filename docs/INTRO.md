# 3D intro: "3PD HELPDESK"

When you open the Franchisee Tracker, a short animated scene plays first. The camera glides down a street past people and cars, then settles in front of a Subway store. A sign on the store's roof lights up and spells out **3PD HELPDESK**, with **MGBD** below it. Then the scene fades into the tracker.

**Loading ring**
- A circular progress ring with the percentage inside covers the 3D engine, the models, the font, and the tracker's database load (`connectSaved()`), table by table.
- The ring starts in the middle of the screen. As soon as the 3D scene is ready, the animation starts and the ring moves to the top-right corner, where it keeps counting while the tracker's data loads. At 100% it turns green and fades out.
- The intro hands off only once the animation is done **and** the data has loaded. If the data is slower, it holds on the last shot until loading finishes, waiting up to 15 seconds for the database.

**Skipping and turning it off**
- Click **Skip intro** or press `Esc`.
- Tick **Don't show the intro again** to turn it off for future visits.
- It plays once per browser tab session.
- The sidebar's **Play intro** button replays it.

**Testing overrides:** add `?intro=1` to the address to force the intro to play, or `?intro=0` to turn it off.

## Files

| File | What it is |
|---|---|
| `src/intro/overlay.js` | `mountIntro()`: the overlay, loading screen, controls, keyboard handling and hand-off |
| `src/intro/scene.js` | The three.js code: asset loading (`LoadingManager`, `GLTFLoader`, `FontLoader`), the scene, the 3D text (`TextGeometry`), people and cars, and the camera move. It's loaded with `import()`, so three.js isn't in the main bundle. |
| `src/intro/settings.js` | Default settings and the rules for when the intro plays. It has no three.js code. |
| `src/intro/intro.css` | Overlay styles. Every class starts with `tpdi-`. |
| `src/intro/IntroGate.jsx` | The React wrapper used in `src/main.jsx`. It makes `#root` inert while the intro is open and focuses `<main id="main">` afterwards. |
| `public/intro/models/*.glb` | `store.glb` is the storefront and rooftop sign. `street.glb` holds the road, sidewalks, neighboring buildings, trees, lights and props. `person.glb` is a walker with `Walk` and `Idle` clips. `car.glb` is a car. |
| `public/intro/fonts/` | Montserrat Black in three.js typeface format, with only the characters the intro uses. `OFL.txt` is the font's license. |
| `scripts/build-intro-assets.mjs` | Generates all of the above from code. Run it with `npm run intro:assets`. |

## How it plays

1. **Scene loading.** The ring is centered under the title, with a status line.
2. **Camera move (10.5 s).** The ring moves to the top-right corner and keeps counting while the data loads. The camera starts high above the road and drops to street level beside the walkers. It then swings round and finishes facing the storefront. At about 6 s the rooftop lamps flicker on, each letter of the heading pops up, and then MGBD appears.
3. **Hand-off.** The last shot holds for 1.8 s, or longer if the data hasn't finished, until the ring reaches 100%. Then the overlay fades out over 600 ms and focus moves to the page content.

## Settings

Defaults are in `src/intro/settings.js`. To override them, pass `config` to `<IntroGate>` in `src/main.jsx`.

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turns the intro on or off |
| `frequency` | `"session"` | `"session"` plays once per tab session, `"always"` plays on every load, `"once"` plays on the first visit only |
| `autoHide` | `true` | Closes the intro on its own after the hold. If `false`, it waits for Skip. |
| `holdMs` | `1800` | How long the last shot is held, in ms |
| `reducedMotion` | `"still"` | With the system's "reduce motion" setting on: `"still"` shows the finished scene without movement, `"skip"` doesn't play the intro |
| `stillHoldMs` | `3500` | How long the still version stays up, in ms |
| `assetBase` | `"/intro/"` | Where `models/` and `fonts/` are served from |
| `heading`, `subheading`, `wordmark` | `"3PD HELPDESK"`, `"MGBD"`, `"SUBWAY"` | The 3D text. Text that's too wide is scaled down to fit. |
| `description` | (a description of the scene) | What screen readers read for the intro |

**Saved in the browser:**
- `localStorage["franchiseeTracker.intro.off"]` records "Don't show the intro again". Delete it to turn the intro back on.
- `sessionStorage["franchiseeTracker.intro.seen"]` records that the intro played in this tab session.
- `localStorage["franchiseeTracker.intro.seenOnce"]` records a first visit, for `frequency: "once"`.

## Swapping in real models

The current models are generated stand-ins: low-poly, untextured, and about 360 KB in total. To replace them, export glTF binary (`.glb`) files with the same names into `public/intro/models/`. Each file must provide what the intro looks for:

| Model | Must contain |
|---|---|
| `store.glb` | Empty nodes named `Anchor_Wordmark`, `Anchor_Heading` and `Anchor_Subheading`; the 3D text is centered on these. Also `Anchor_SignLight`, where the sign's light goes. Optionally a material named `SignLamp`, which lights up during the reveal. The store front faces +Z, and the sidewalk is at y = 0.15 m. |
| `person.glb` | Animation clips named `Walk` (one stride, about 1.4 m) and `Idle`. The figure faces +Z with its feet at y = 0. Materials named `Shirt`, `Pants`, `Skin` and `Hair` get a different color for each person. |
| `car.glb` | The car faces +X. Meshes named `Wheel_*` spin. A material named `CarPaint` gets a different color for each car. |
| `street.glb` | No required names. Meshes whose names contain `Asphalt`, `Concrete`, `Curb`, `Grass`, `ParkingLot` or `Paint` receive shadows but don't cast them. |

The **SUBWAY** sign above the windows is currently the word typed in Montserrat. It isn't the official logo. To use the real one:
1. Build the official logo artwork into `store.glb` on the green band above the windows.
2. Set `wordmark: ""` in the intro settings so the typed word isn't drawn.

## Accessibility

- **Screen readers:** the intro is a modal dialog labelled "3PD HELPDESK, MGBD". Its description tells screen reader users what the scene shows, and the 3D canvas itself is hidden from them.
- **Keyboard:**
  - Focus starts on **Skip intro**.
  - `Tab` moves between the checkbox and Skip.
  - `Esc` skips.
  - While the intro is open, the tracker behind it can't be reached (`#root` is inert). When it closes, focus moves to `<main>`.
- **Loading ring:** it's a `progressbar` with a live value. In the corner, it sits on a dark disc so the number stays readable over the scene.
- **Reduced motion:** with the system's "reduce motion" setting on, the intro shows a still frame without fades or zooms.
- **Controls:** they sit over a dark gradient for contrast. Touch targets are 44 px, focus rings are visible, and they work in forced-colors (high contrast) mode.
- **Fallback:** if WebGL is unavailable or anything fails to load, the intro is skipped and the tracker opens.

## Performance

- **Download:** about 360 KB of models and font, plus the three.js chunk (about 170 KB gzipped). The chunk only downloads when the intro plays.
- **Lower-end devices:** touch devices and machines with 4 or fewer CPU cores or 4 GB or less of memory get fewer people. They also get no shadows, no antialiasing and a lower pixel ratio.
- **Smoothness:** the static scenery is merged into one mesh per material. The animation pauses while the tab is hidden.
- **Cleanup:** when the intro closes, it frees everything it used on the GPU.

## Dependencies and licenses

| What | Used for | License |
|---|---|---|
| `three` | Rendering, glTF loading and the 3D text | MIT |
| Montserrat Black (`@expo-google-fonts/montserrat`, dev only) | Source of the 3D font | SIL Open Font License 1.1 |
| `opentype.js` (dev only) | Converting the font file to three.js format | MIT |

## Known limitations

- The models are simple generated stand-ins, and the wordmark isn't the official Subway logo.
- The intro has been tested in Edge at desktop and phone sizes. It hasn't been tested on real phones, Safari, Firefox or low-end graphics hardware.
