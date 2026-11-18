# 3D intro: "3PD HELPDESK"

When you open the Franchisee Tracker, a 3D animation is its loading screen. The camera glides down a street past people and cars, then settles in front of a two-storey Subway store, styled after a reference picture: red awnings with a yellow band, a green upper floor with a row of windows, a green top that curves back into the roof with **SUB**WAY on it, and glass shop windows you can see inside through. The sky is bright blue with clouds. A sign on the store's roof lights up and spells out **3PD HELPDESK**, with **MGBD** below it.

**Loading ring**
- There is no separate title screen; the 3D animation is the whole loading screen. Until the scene is ready, which usually takes a moment, only a sky-colored backdrop shows, and the scene fades in over it.
- A circular progress ring with the percentage inside appears beside the animation, on the right and vertically centered, **when the animation starts**. A "Loading" line sits under it.
- The ring counts the animation and the tracker's database load (`connectSaved()`, table by table) together and shows whichever is further behind. With fast data, it climbs steadily with the animation and reaches 100% as the animation ends.
- **The tracker opens only after the animation has finished**: the 8-second camera move plus a 0.6-second hold on the store. If the data is still loading at that point, the ring holds below 100%, the camera sways slowly in front of the store, and the tracker opens as soon as the data arrives. It waits up to 15 seconds for the database.

**Skipping and turning it off**
- Click **Skip intro** or press `Esc`.
- Tick **Don't show the intro again** to turn it off for future visits.
- It plays once per browser tab session.
- **Settings → Intro → Play intro** replays it, and the **Play the intro when the tracker opens** checkbox there turns it on or off.

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

1. **Scene loading.** A sky-colored backdrop, with Skip and the checkbox at the bottom.
2. **Animation and loading ring together.** The camera starts high above the road and drops to street level beside the walkers. It then swings round and finishes facing the storefront (8 s), holds for 0.6 s, and sways slowly if the data isn't done yet. At about 4.5 s the rooftop lamps flicker on, each letter of the heading pops up, and then MGBD appears. Meanwhile the ring counts up beside it.
3. **Hand-off.** When the ring reaches 100% (animation finished and data loaded), the overlay fades out over 600 ms and focus moves to the page content.

**The store:** two bays. The left bay has a green door with a poster, a narrow window and a green box upstairs with its own windows. The front bay has the big shop windows and, upstairs, five framed windows under the curved green fascia. Both bays have sloped red awnings with a yellow valance, with a red band and a projecting green belt above them. Red bins, yellow bollards and blue planters stand on the sidewalk. The upper-floor windows are dark reflective glass. The shop windows are clear glass (`MeshPhysicalMaterial` with transmission) that reflect the street, from an environment map captured from the middle of the road. Through them you see the interior: tiled floor, the sandwich counter with ingredient bins, a sandwich artist in green and two customers, menu boards, pendant lights, a drinks cooler and window tables. A warm light inside also spills onto the sidewalk. Low-end devices get a cheaper see-through glass with the same reflections.

## Settings

Defaults are in `src/intro/settings.js`. To override them, pass `config` to `<IntroGate>` in `src/main.jsx`.

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turns the intro on or off |
| `frequency` | `"session"` | `"session"` plays once per tab session, `"always"` plays on every load, `"once"` plays on the first visit only |
| `autoHide` | `true` | Opens the tracker on its own once the animation has finished and the data has loaded. If `false`, it waits for Skip. |
| `holdMs` | `600` | How long the final shot holds after the camera move, before the tracker opens, in ms |
| `reducedMotion` | `"still"` | With the system's "reduce motion" setting on: `"still"` shows the finished scene without movement, `"skip"` doesn't play the intro |
| `stillHoldMs` | `3500` | Shortest time the still version stays up, in ms |
| `assetBase` | `"/intro/"` | Where `models/` and `fonts/` are served from |
| `heading`, `subheading`, `wordmark` | `"3PD HELPDESK"`, `"MGBD"`, `"SUBWAY"` | The 3D text. Text that's too wide is scaled down to fit. |
| `wordmarkSplit` | `3` | Letters of the wordmark before this position are yellow and the rest white (SUB / WAY) |
| `description` | (a description of the scene) | What screen readers read for the intro |

**Saved in the browser:**
- `localStorage["franchiseeTracker.intro.off"]` records "Don't show the intro again". Delete it to turn the intro back on.
- `sessionStorage["franchiseeTracker.intro.seen"]` records that the intro played in this tab session.
- `localStorage["franchiseeTracker.intro.seenOnce"]` records a first visit, for `frequency: "once"`.

## Swapping in real models

The current models are generated stand-ins: low-poly, untextured, and about 510 KB in total. To replace them, export glTF binary (`.glb`) files with the same names into `public/intro/models/`. Each file must provide what the intro looks for:

| Model | Must contain |
|---|---|
| `store.glb` | Empty nodes named `Anchor_Wordmark`, `Anchor_Heading` and `Anchor_Subheading`; the 3D text is centered on these. Also `Anchor_SignLight`, where the sign's light goes, and `Anchor_InteriorLight`, where the warm light inside goes. Shop-window glass must use a material named `ShopGlass` (replaced by see-through glass at runtime), and upper-floor glass a material named `UpperGlass` (replaced by reflective glass). Optionally a material named `SignLamp`, which lights up during the reveal. The store front faces +Z, and the sidewalk is at y = 0.15 m. |
| `person.glb` | Animation clips named `Walk` (one stride, about 1.4 m) and `Idle`. The figure faces +Z with its feet at y = 0. Materials named `Shirt`, `Pants`, `Skin` and `Hair` get a different color for each person. |
| `car.glb` | The car faces +X. Meshes named `Wheel_*` spin. A material named `CarPaint` gets a different color for each car. |
| `street.glb` | No required names. Meshes whose names contain `Asphalt`, `Concrete`, `Curb`, `Grass`, `ParkingLot` or `Paint` receive shadows but don't cast them. |

The **SUBWAY** lettering on the green fascia is the word typed in Montserrat, with SUB in yellow and WAY in white. It isn't the official logo and has no arrows on the S and Y. To use the real one:
1. Build the official logo artwork into `store.glb` on the green band above the windows.
2. Set `wordmark: ""` in the intro settings so the typed word isn't drawn.

## Accessibility

- **Screen readers:** the intro is a modal dialog labelled "3PD HELPDESK, MGBD". Its description tells screen reader users what the scene shows, and the 3D canvas itself is hidden from them.
- **Keyboard:**
  - Focus starts on **Skip intro**.
  - `Tab` moves between the checkbox and Skip.
  - `Esc` skips.
  - While the intro is open, the tracker behind it can't be reached (`#root` is inert). When it closes, focus moves to `<main>`.
- **Loading ring:** it's a `progressbar` with a live value. Over the animation, it sits on a dark disc and its status text has a shadow, so both stay readable over the scene.
- **Reduced motion:** with the system's "reduce motion" setting on, the intro shows a still frame without fades or zooms.
- **Controls:** they sit over a dark gradient for contrast. Touch targets are 44 px, focus rings are visible, and they work in forced-colors (high contrast) mode.
- **Fallback:** if WebGL is unavailable or anything fails to load, the intro is skipped and the tracker opens.

## Performance

- **Download:** about 510 KB of models and font, plus the three.js chunk (about 170 KB gzipped). The chunk only downloads when the intro plays.
- **Frame rate:** about 150–180 fps at 1440×900 on an AMD Radeon RX 570, a mid-range card from 2017, with the glass, shadows and interior.
- **Lower-end devices:** touch devices and machines with 4 or fewer CPU cores or 4 GB or less of memory get fewer people. They also get no shadows, no antialiasing and a lower pixel ratio.
- **Smoothness:** the static scenery is merged into one mesh per material. The animation pauses while the tab is hidden.
- **Cleanup:** when the intro closes, it frees everything it used on the GPU.

## Dependencies and licenses

| What | Used for | License |
|---|---|---|
| `three` | Rendering, glTF loading and the 3D text | MIT |
| Montserrat Black (`@expo-google-fonts/montserrat`, dev only) | Source of the 3D font | SIL Open Font License 1.1 |
| `fontkit` (dev only) | Converting the font file to three.js format, with kerning | MIT |

## Known limitations

- The models are simple generated stand-ins, and the wordmark isn't the official Subway logo.
- The tracker always takes at least about 9 seconds to open while the intro is on, because it waits for the animation. Use Skip, or turn the intro off in Settings, to go straight in.
- The intro has been tested in Edge at desktop and phone sizes. It hasn't been tested on real phones, Safari, Firefox or low-end graphics hardware.
