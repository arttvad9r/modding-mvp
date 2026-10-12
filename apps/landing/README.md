# MyModz landing

Standalone, dependency-free landing page for MyModz. It is intentionally isolated from `apps/web` and does not call the production API, auth, worker, Factorio runtime, or deployment code.

## Local development

```bash
pnpm --filter @project/landing typecheck
pnpm --filter @project/landing test
pnpm --filter @project/landing build
python3 -m http.server 4173 --directory apps/landing/dist
```

Use `?lang=en` or `?lang=ru` to force a locale. Otherwise the landing remembers the language in `localStorage` and falls back to the browser locale.

## Product story

The landing follows the actual current web product rather than exposing internal architecture as the primary story:

`write a request on the website → see what the mod changes → real Factorio validation → download ZIP → refine with another request`

The main showcase uses real supported product examples from the repository, including the linked `Reinforced Plate → Reinforced Furnace` content tree and mixed rebalance bundles.

## Visual system

- High-contrast graphite surfaces with warm Factorio-orange actions and green only for validated states.
- A local system font stack with large display headings, readable body text and brighter secondary labels. No font downloads.
- Inline SVG icons share one stroke style, remain decorative for accessibility, and survive EN/RU switching.
- Large product/game visuals and simple readable overlays replace the earlier tiny pipeline diagrams and stretched concept screenshots.
- Four local high-resolution Factorio images come from Wube's official press kit, which explicitly welcomes use of its website screenshots/assets for coverage. The page links back to `factorio.com` in the footer.
- Game imagery is presented as context/illustration, not as a claim that MyModz generates new art. Copy explicitly states that current new-machine support reuses reviewed base-game graphics.
- Images preserve aspect ratio through `object-fit: cover`; no screenshot is stretched.
- `prefers-reduced-motion` disables reveal motion.

## Layout

Desktop sections reserve at least one viewport, with space for the fixed header. Section and card heights remain content-driven; nothing is clipped to force a fit. Headings share a row with their supporting copy, Build uses four compact cards, and the hero guarantees sit below its game visual. Mobile keeps a normal vertical flow. Expanded FAQ answers or enlarged accessibility text may naturally grow a section.

Browser QA covers all five navigation anchors in EN/RU at 1640×818, plus compact desktop checks at 1280×720 and 1024×768 and mobile at 390×844. Screenshots are inspected alongside geometry checks; the latter alone are not visual proof.

## Integration points

The landing remains static by design. Every landing CTA has `data-action="build-mod"` and opens the workshop. Its Generate action dispatches a cancelable `mymodz:build-requested` event with `{ source, prompt }`.

A host application can intercept that event and route directly into the existing same-origin web generation flow:

- `POST /v1/generations` — create a generation;
- `GET /v1/generations/:id` — poll status/result;
- `GET /v1/generations` — history;
- `POST /v1/generations/:id/revise` — follow-up revision;
- `GET /v1/generations/:id/download` — validated ZIP.

All Create a mod CTAs open the same native dialog, `#mod-workspace`. Hero/final requests are transferred to its composer; the header preserves an existing draft. The draft survives reload in tab-scoped `sessionStorage`. Escape or Back to website closes the dialog and restores focus. The dialog supports EN/RU and a normal scrolling mobile layout.

Opening the workshop never starts a generation. Submitting its form dispatches the existing cancelable `mymodz:build-requested` event with `{ source, prompt }`, retaining the original CTA source. A host must cancel that event when it accepts the request. Without a host listener the workshop displays unavailable, retains the draft, and never simulates success or offers a fake ZIP.

The host reports state using `window.dispatchEvent(new CustomEvent("mymodz:generation-updated", { detail }))`. The detail is `{ status, generationId?, title?, message?, changes? }`; `status` is `queued | running | succeeded | failed | unsupported`, and `changes` is an array of human-readable strings. Only a succeeded record with a non-empty generation ID unlocks the result, ZIP action and revision form. Public text is rendered with `textContent`.

The download action dispatches cancelable `mymodz:download-requested` with `{ generationId }`; the host obtains the owner-authorized download through the existing API. Revisions dispatch cancelable `mymodz:revision-requested` with `{ generationId, prompt }`; the host submits a fresh revision and reports its state through the same update event. These are frontend adapter hooks; this static preview does not connect to production or change auth/API contracts.

## Files

- `index.html` — landing structure and product/game showcases.
- `styles.css` — design system, responsive layout and accessibility styling.
- `app.js` — EN/RU localization, example prompt filling, navigation, reveal behavior and integration events.
- `assets/logo-mark.svg` — MyModz mark.
- `assets/game/factory.webp` — optimized official Factorio press-kit screenshot used in the hero.
- `assets/game/smelting.webp` — optimized official Factorio press-kit screenshot used for the content-chain showcase.
- `assets/game/mining-drills.webp` — optimized official Factorio press-kit artwork used for the rebalance capability.
- `assets/game/rocket.webp` — optimized official Factorio press-kit screenshot used in the validation section.
- `scripts/build.mjs` — dependency-free static build.
- `test/smoke.mjs` — static product/scope/asset contract checks.
- `screenshots/desktop.png` / `screenshots/mobile.png` — local QA captures.
