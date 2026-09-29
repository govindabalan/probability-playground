# Probability Playground

Interactive web game teaching probability, compounding, and CAGR to ages 10+.

## Live Demo
https://govindabalan.github.io/probability-playground/

## Features
- 🎲 **Configurable return distributions** — Set average return (%) and volatility (%) with Apply & Reset
- 📊 **Rolling 20-year chart** with zoom out, data labels, circles at data points
- 🌓 **Light/dark/system themes** with high-contrast support — chart auto-updates
- 💾 **localStorage + export/import + shareable URLs** — state persists, portable
- 📱 **PWA: installable, works offline** — Service Worker v7 (network-only for JS)
- ♿ **WCAG 2.1 AA accessible** — keyboard nav, screen readers, focus outlines

## Tech Stack
- Vanilla ES modules (no build step)
- Canvas 2D chart (no dependencies)
- mulberry32 + Box-Muller RNG (seedable, deterministic)
- Service Worker v7 (network-only for JS modules)
- GitHub Actions CI/CD with Playwright E2E tests

## Run Locally
```bash
cd probability-playground
python3 -m http.server 8080
# open http://localhost:8080
```

## Development Scripts
```bash
npm install          # Install Playwright
npm run verify       # Syntax + duplicate check + server test
npm run backup       # Timestamped backup to versions/
npm run test         # Playwright E2E tests
npm run deploy       # Verify → backup → commit → push → auto-deploy
```

## Game Mechanics
- **Up**: Bets *with* the random draw (v × (1 + r/100))
- **Down**: Bets *against* the random draw (v × (1 - r/100))
- **Random draw**: Normal distribution, configurable mean & volatility
- **CAGR**: (v/100)^(1/years) - 1
- **Volatility drag**: Geometric mean < Arithmetic mean

## Return Distribution Parameters (hidden behind ℹ️ button)
- **Average Return (%)**: Default 0% — shifts distribution center
- **Volatility (%)**: Default 25% — 95% range ±volatility
- Apply & Reset → resets game with new distribution

## Shareable URLs
```
https://govindabalan.github.io/probability-playground/?seed=42&mean=2&vol=25&theme=dark
```
Params: `seed`, `mean`, `vol`, `theme`, `speed`

## Deploy
Push to `main` → GitHub Actions runs lint + Playwright E2E → deploys to GitHub Pages.

## License
Unlicense (public domain)