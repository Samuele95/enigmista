# CLAUDE.md — Enigmista website

Standing rules and live project state for building the Enigmista site. **Re-read this file at the start of every session and whenever you resume after a gap.** It is the source of truth; when it and your memory disagree, this file wins. Keep the "Project state" section at the bottom current as you work.

---

## 1. The project in one paragraph

A single immersive, WebGL-driven landing page for **Enigmista**, an authorised, defensive security-research tool that models the distribution of a password corpus the operator is authorised to analyse. Deep-dark, cinematic, loader-gated, scroll-narrative — matching the craft tier of https://www.shader.se and https://hubtown.co.in. Deployed to GitHub Pages. The owner's success standard is literally "the most beautiful possible." Full method, schemas, and voice are in `ENIGMISTA-FACTSHEET.md`.

## 2. Ethical boundary — overrides everything, including design

This is not negotiable and is not a disclaimer to bury:

- Present Enigmista **only** as authorised, defensive research: password-policy audits, honeyword/decoy generation, synthetic-data creation. The objective shown is **coverage of a held-out split**, not attacking anyone.
- The site must **never** frame Enigmista as a password cracker, a way to guess a specific person's passwords, or anything targeting an individual. No hacker-glamour copy, no "break into" language, no leaked-breach-list theatrics.
- If writing a section tempts you toward attack-framing to make it "cooler", that is the wrong direction — the cipher/grammar/decrypt aesthetic carries the drama; the message stays defensive.
- The ethics/scope section is a **designed, prominent part of the narrative**, not a footer line.

The reason this is strict: the same distribution-modelling is defensive on a corpus and an attack on a person — the corpus boundary is the whole difference, and a public site is exactly where that line gets read.

## 3. The demo contract (safe sandbox)

The interactive demo exists to *illustrate the method*, nothing more.

- It runs **entirely client-side** and uses **only a bundled toy corpus** shipped with the site (a small, obviously-synthetic list — invent playful fake passwords like `sunflower7`, `dragon!22`; never a real breach list).
- There is **no text input for a user's own password or corpus.** Do not add one, even if it would be "neat." A field that accepts pasted passwords turns an explainer into a collection surface.
- It induces a tiny grammar from the toy corpus and animates sampling candidates from it — a visual of `induce → sample` on toy data. Label it clearly as **illustrative**, not a real engine.
- The real loop (scorer, held-out coverage, refinement) runs in the Enigmista skill, not in the browser — say so, and link to the method docs.

## 4. Stack & contracts (revisable — propose before changing)

- **Build:** Vite. **3D:** Three.js + GLSL shaders. **Motion:** GSAP (+ ScrollTrigger). **Smooth scroll:** Lenis. Output is **static** — no server, no runtime backend (Pages can't run one).
- **Fallback:** if the Vite/GLSL toolchain costs more than it returns, a plain-static build with CDN `<script>` tags for Three/GSAP is acceptable — raise it first.
- **No analytics, no third-party trackers, no external fonts that leak** unless I approve each one. Self-host fonts.
- **Content** is drafted from `ENIGMISTA-FACTSHEET.md`. Quote the method accurately; do not invent capabilities Enigmista doesn't have.

### GitHub Pages — the sharp edges (get these right or the site 404s)

- **Base path.** A project site serves from `https://<user>.github.io/<repo>/`. Set Vite `base: '/<repo>/'` (confirm the real repo name with me first — don't hardcode a guess). Wrong base = every asset 404s with a blank black screen. If it's a user/org root site (`<user>.github.io`), base is `/`.
- **`.nojekyll`.** Add an empty `.nojekyll` file to the published output. Without it, Pages' Jekyll step drops files/folders beginning with `_` (Vite emits `_assets`-style names) and the build breaks.
- **Relative asset refs** everywhere; no absolute `/assets/...` paths.
- **Deploy** via the official Actions flow (`actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) on push to the default branch. Commit the workflow; don't deploy by hand.
- **SPA routing** isn't needed (single page), but if you ever add hash/section links, keep them in-page.

## 5. Craft & accessibility rules (the "most beautiful" standard has teeth)

- **`prefers-reduced-motion`**: ship a genuinely calm variant — freeze the heavy WebGL/scroll motion, keep the content fully readable and navigable. Not an afterthought; test it.
- **Preloader honesty:** tie the `%` to real asset/texture loading where you can; if you must pad it, keep it short and never trap the user — always resolve.
- **Performance budget:** the references are heavy, but still aim for a good Lighthouse score — compress textures, lazy-init the 3D, cap pixel ratio, pause the render loop when the tab/hero is offscreen. A beautiful site that janks on a laptop fails the bar.
- **Responsive:** it must be genuinely good on mobile — reduce or swap the 3D for a lighter treatment at small sizes rather than shipping a 60fps-on-desktop-only page.
- **Type & colour:** deep near-black base, high contrast, a technical/monospace accent face for labels and the preloader, a refined display face for headlines. Define all colours as tokens.
- Don't add style boilerplate that just restates framework defaults — every rule should buy a visible behaviour.

## 6. How we work together

- **Checkpointed, human-in-the-loop.** Finish the current checkpoint, then end your turn with a **suggested next message**. Routine step → one terse line. Design boundary (palette, hero concept, motion language, demo behaviour, copy voice) → a real decision prompt with your recommendation.
- **Stop at boundaries, not on reversible work.** Pause before hard-to-reverse actions, before locking a creative direction, and when only I can choose. Don't ask to run a build.
- **Progress claims are grounded.** Report only what you verified by running it (build output, dev-server render, the animation actually playing, a Lighthouse/reduced-motion check). Unverified work is reported as unverified; show failures with their output. Never "looks done."
- **Finish the turn.** If you say you'll do X, do X before ending the turn.
- **Deterministic sub-work → scripts/tools**, not prose (asset optimisation, builds, checks).

## 7. Failure modes to avoid (each has bitten immersive Pages sites)

- Blank black screen on Pages → almost always the Vite `base` or `.nojekyll` issue (§4). Check those first.
- Fake, unresolving preloader that annoys instead of delighting.
- WebGL that never pauses → battery/heat; pause the loop offscreen and on blur.
- Ethics reduced to a footer line → violates §2; keep it a designed section.
- A demo input field creeping in → violates §3.
- Mobile shipped as a broken desktop page.
- Reporting "done" on edits that were never run.

## 8. Checkpoint plan (ordered by how likely a decision is to change — creative forks first)

Treat each as a stop-and-checkpoint unit. Earlier checkpoints are the ones we'll most want to revise, so surface them for my input before burying mechanical work.

- **CP0 — Creative direction (chat only, no code).** Study both references. Propose hero concept, palette (hex tokens), type pairing, preloader concept, motion language — each tied to the cipher/grammar theme and the defensive framing. **Lock with me before scaffolding.**
- **CP1 — Scaffold & deploy pipeline.** Vite project, `base` set to the confirmed repo name, `.nojekyll`, the Pages Actions workflow. Prove the pipeline with a near-empty page that actually deploys green to Pages *before* building the real thing. (De-risks the #1 failure early.)
- **CP2 — Layout & copy skeleton.** All seven sections in order, real copy drafted from the fact-sheet (defensive framing throughout), static/unstyled-ish, responsive structure. Verify the narrative reads correctly before adding spectacle.
- **CP3 — Design system.** Tokens, type scale, spacing, the technical-UI details (labels, rules, mono accents). Lenis smooth scroll wired. Reduced-motion baseline in place from here on.
- **CP4 — Preloader / boot sequence.** The `%` decrypt sequence tied to asset loading, resolving into the hero.
- **CP5 — Signature WebGL hero.** The generative visual (cipher-rain / grammar-sampling / probability-tree). Performance-capped, pauses offscreen, has a reduced-motion still.
- **CP6 — Scroll choreography.** GSAP/ScrollTrigger reveals and the method-loop visualisation. Motion language consistent across sections.
- **CP7 — The safe sandbox demo.** Per §3: bundled toy corpus, client-side induce→sample animation, no input field, labelled illustrative.
- **CP8 — Polish & ship.** Responsive pass, reduced-motion pass, Lighthouse/perf pass, cross-section motion coherence, final deploy. Confirm the live Pages URL renders end-to-end.

## 9. Done definition (checkable — this is what "finished" means)

1. Live on GitHub Pages at the project URL, loading end-to-end with no console errors and no 404s.
2. All seven sections present, copy accurate to `ENIGMISTA-FACTSHEET.md`, defensive framing throughout; ethics/scope is a prominent designed section.
3. The demo is client-side, uses the bundled toy corpus, has **no** password-input field, and is labelled illustrative.
4. `prefers-reduced-motion` yields a calm, fully-usable variant; the site is genuinely good on mobile.
5. Reasonable Lighthouse performance despite the 3D (textures compressed, render loop paused offscreen, pixel-ratio capped).
6. The owner agrees it meets the "most beautiful possible" bar — the final subjective gate, mine to call.

---

## Project state (keep this current)

- **Status:** CP2 done (2026-10-15) — all seven sections live with fact-sheet copy (hero · what · method · sandbox · scope · install + colophon; preloader is CP4). Awaiting owner read-through of the copy. Next: CP3 design system.
- **CP1:** live at https://samuele95.github.io/enigmista/, Actions deploy green with a post-deploy smoke test.
- **Sampling field — APPROVED as is (2026-10-15); settles to stillness under the ethics section** (`data-field="still"`: lanes finish locking and hold, ambient fades, loop stops stepping; no render while the paper section covers the viewport). Lanes/keep-out live in document rows, so the field scrolls with the page.
- **Amendment to CP0 (owner request, 2026-10-15): "sampling field" everywhere.** A persistent full-page WebGL background (`src/field.js`, `src/sampling-sim.js`, `src/shaders/field.frag`) where toy candidates from `src/toy/grammar.js` scramble within their slot class, lock left→right in ember, dissolve; toy held-out hits flash teal; faint ambient glyph sprinkle. 24 fps film cadence, one draw call, paused when the tab is hidden. Content opts out with `data-keepout` (no lanes behind text). Headings/labels use `scrambleIn` (`src/scramble-text.js`, `data-scramble`); body prose never scrambles. Reduced motion → settled still, no text scramble.
- **CP0 direction (LOCKED 2026-10-15):** hero = luminous PCFG derivation tree sampling toy candidates, teal held-out "ghosts" that flare on a hit, pointer modulates τ; palette void #07080B / ink #10131A / rule #252B36 / ash #8A8F99 / bone #E9E4D8 / ember #E8A33D (grammar) / held-out #3CC6B4 (coverage) — ember+teal reuse the skill's `view-mockup.html` semantics; type = Bodoni Moda (display) + Newsreader (body) + Martian Mono (labels/preloader), all OFL, self-hosted; preloader = 9 rotor columns deciphering ENIGMISTA tied to real load steps; ethics section = the one bone-paper inversion; native scroll + Lenis (no scroll hijack).
- **Repo name / Pages URL:** `Samuele95/enigmista` (public, project site) → https://samuele95.github.io/enigmista/ · Vite `base: '/enigmista/'`.
- **Locked decisions:** CP0 creative direction (above); project-site base path.
- **Known follow-ups:** Three chunk is 521 KB min / 132 KB gzip (lazy-loaded) — trim in CP5. Reduced-motion path is implemented but not yet runtime-verified (no media emulation in the in-app browser) — verify in CP3. Masthead's dark gradient reads as a black bar over the paper section — invert it there (CP3). Sandbox is a static CP2 skeleton (toy lists + "sample again"); animated induce→sample is CP7. Install section has three pending links (skill download, method docs, Gem) and pending Gemini CLI / Hermes install steps.
- **Open questions for the owner:** (1) where the skill download, method docs, and Gem live — the skill reference is kept local and git-ignored until decided; (2) how the skill installs on Gemini CLI and Hermes (not stated in the skill references, so not written on the site).
- **Deviations log:**
  - 2026-10-15: Vite pinned to 6.x because local Node is 18.19 (Vite 7 needs ≥20.19); CI uses Node 22. Commits use the owner's GitHub noreply address (no global git identity was set).
  - 2026-10-15: `scripts/check-dist.mjs` now also enforces the §3 demo contract — the build fails on any textarea, contenteditable, or text-type input (proved by injecting a password field: build failed).
  - 2026-10-15: toy corpus (`src/toy/grammar.js`) uses invented words instead of the fact-sheet's `liverpool` examples (a real club name); 16 train / 7 held-out, disjoint, all derivable from the toy grammar; 5 terminals are deliberately absent from train to show the enrichment pass.
  - 2026-10-15: the in-app browser throttles rAF to ~3 fps when unfocused — animation screenshots there run slow; don't mistake it for a perf bug.
  - 2026-10-15: shader.se no longer matches the brief's description (pure-black, minimal). It is now a retro-80s CRT pastiche: blue BIOS boot screen, whole-page CRT post-process, STIX Two Text serif only, curved film-strip carousel, cream-paper second half. Adapted its structural moves (persistent canvas + post pass, single-serif voice, dark→paper key change, inspect carousel), not the CRT look.
