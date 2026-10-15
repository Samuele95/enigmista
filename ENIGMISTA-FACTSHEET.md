# Enigmista — fact-sheet for website copy

Everything the site needs to describe Enigmista **accurately**. Write copy from this, not from imagination. Do not claim capabilities not listed here. The full skill (`SKILL.md`, `references/method.md`, `references/loop.md`, `references/wiring.md`, `references/verifier.md`, `scripts/eval_coverage.py`, `assets/view-mockup.html`) ships in the owner's `enigmista-skill` zip — pull exact schemas and the view mockup from there if you need them.

## One-liner (use variants of this, never "cracker")

> Enigmista models the structure of an **authorised** password corpus and generates new, previously-unseen candidates that fit its distribution — for policy audits, honeyword/decoy generation, synthetic data, and research.

## What it is

A **neurosymbolic, agentic password candidate generator**. Two layers working together:

- **Neural (the LLM):** induces a *generative grammar* from a seed corpus — it names the themes, categorises the slots, and extends the dictionaries with plausible unseen members. This is where it beats a plain statistical model: it generalises beyond what it was shown.
- **Symbolic (the sampler + scorer):** a deterministic sampler draws new candidates from the grammar (ordered by model probability = guess order), and a scorer measures how well those candidates cover a **held-out** split of real passwords.

The grammar it induces is a **PCFG** (probabilistic context-free grammar): templates, slot categories, terminal dictionaries, production probabilities, and named themes.

## The objective (this is the interesting, honest part — feature it)

The goal is **coverage of unseen-but-real passwords**, *not* fidelity to the seed. A model that perfectly memorises the seed corpus is worthless — it just regenerates what it was already given. Enigmista is measured on a frozen held-out split it never trained on. That reframing — "predict the passwords you *haven't* seen" — is the soul of the tool and makes a great narrative beat.

## The loop (the method section — visualise this)

A goal-based loop: **`induce → sample → score → analyse misses → refine`**, repeated until it plateaus or hits a target.

1. **Corpus & protocol** — load the authorised seed, dedup, freeze an 80/20 train/held-out split (never re-split — that leaks the test set). Compute Markov + basic PCFG **baselines** = the number to beat.
2. **Induce** — the LLM builds the first PCFG from the training split; on a strong model, a semantic-enrichment pass names themes and extends dictionaries with plausible unseen terms.
3. **Sample** — draw a budget of candidates at temperature τ, ordered by probability (guess order).
4. **Score** — run the bundled scorer against the held-out split. Coverage, novelty, and baseline deltas come **only** from the scorer — never self-assessed.
5. **Analyse misses & refine** — read the held-out entries the candidates *missed*, hypothesise the missing structure, refine the grammar, repeat.
6. **Stop** — when coverage beats the best baseline by a margin and gains plateau, or an iteration cap is hit.

**Verification is non-negotiable and scorer-only.** A run never claims improvement because an edit succeeded or the candidates "look plausible" — it quotes the scorer's numbers on the frozen held-out set. (This honesty discipline is a selling point; it belongs in the copy.)

## Where it runs

It's a **skill** (and a matching Gemini "Gem" front-end). The real loop runs in a runtime with disk + script execution — **Claude Code, Hermes, or Gemini CLI**. The Gem is a conversational front-end that *reasons about* the method and writes the code/commands, but can't execute the loop itself. The site is marketing/explainer for the skill — point people to install it in one of those runtimes.

## Scope & ethics (a prominent, designed section — not fine print)

- **Authorised, defensive use only:** password-policy audits the operator may run, honeyword/decoy generation, synthetic-data creation, research.
- Works **only** from a seed corpus the operator supplies and is authorised to use — a *population* of passwords, not one person's.
- **Never** incorporates a specific individual's personal data to guess their passwords, and **never** produces or ranks candidates aimed at an individual's accounts. That would turn distribution-modelling into an attack on a person — out of scope, refused.
- The corpus boundary is the whole ethical line: the same machinery is defensive on a corpus and an attack on a person.
- Artifacts (candidate lists, grammars) are treated as sensitive — written to a local `./out/`, never anywhere shared or public.

## Voice & tone for the copy

Cinematic, precise, confident, a little playful — the register of shader.se's editorial prose, adapted to a cipher/research tool. Think "calm machine that decodes structure", not "l33t hacker". Technical vocabulary used correctly (grammar, distribution, coverage, held-out, honeyword) is part of the aesthetic. Lean on the *enigma / cipher / decrypt / structure* imagery; keep the *message* defensive and exact.

## Name

**Enigmista** — Italian for "puzzle-maker / enigmatist" (one who crafts and solves enigmas). Good material for the hero and the decrypt-preloader concept.

## Safe toy corpus for the demo (invent in this spirit — never a real breach list)

Small, obviously-synthetic, themed so a tiny grammar is visible: e.g. `summer2021`, `summer2022`, `dragon!7`, `dragon!9`, `liverpool99`, `liverpool00`, `sunflower_1`, `sunflower_2`. Enough that the induced grammar (`<word><year>`, `<word>!<digit>`, `<word>_<digit>`) is legible when animated.
