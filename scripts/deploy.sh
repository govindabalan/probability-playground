#!/bin/bash
# scripts/deploy.sh — One-command deploy
# Runs verification, commits, pushes, and triggers GitHub Actions deploy

set -e

cd "/Users/govindabalan/Vibe Coding/Probability Game"

echo "→ Running pre-deploy verification..."
./scripts/verify.sh || exit 1

echo "→ Creating backup..."
./scripts/backup.sh

echo "→ Committing changes..."
git add .
git commit -m "v$(date +%Y.%m.%d-%H%M): automated deploy" || echo "No changes to commit"

echo "→ Pushing to GitHub..."
git push origin main

echo "🚀 Deploy triggered!"
echo "🔗 Watch: https://github.com/govindabalan/probability-playground/actions"
echo "🌐 Live at: https://govindabalan.github.io/probability-playground/"