#!/bin/bash
# scripts/backup.sh — Run before any edit batch
# Creates timestamped backup in versions/YYYY-MM-DD_HH-MM-SS/

set -e

cd "/Users/govindabalan/Vibe Coding/Probability Game"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="versions/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"
cp -r index.html css js assets manifest.json sw.js "$BACKUP_DIR/" 2>/dev/null

echo "✓ Backed up to $BACKUP_DIR"