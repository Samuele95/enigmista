# Enigmista — site

The public site for **Enigmista**, an authorised, defensive security-research skill that models the structure of a password corpus the operator is authorised to analyse — for policy audits, honeyword/decoy generation, and synthetic data. It is not a password cracker and never targets an individual.

Live: https://samuele95.github.io/enigmista/

## Develop

```bash
npm ci
npm run dev      # http://localhost:5173/enigmista/
npm run build    # vite build + scripts/check-dist.mjs (base path, .nojekyll, asset refs)
npm run preview  # serve dist at /enigmista/
```

Deploys to GitHub Pages on push to `main` via `.github/workflows/deploy.yml`.

Project rules and live state: `CLAUDE.md`. Copy source of truth: `ENIGMISTA-FACTSHEET.md`.
