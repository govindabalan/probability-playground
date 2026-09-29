#!/bin/bash
# scripts/verify.sh — Run before commit/push
# Validates syntax, duplicates, and server serves correctly

set -e

cd "/Users/govindabalan/Vibe Coding/Probability Game"

echo "→ Syntax check..."
for f in js/*.js; do
  node --check "$f" || exit 1
done

echo "→ Duplicate function check..."
for f in js/*.js; do
  dup=$(grep "^function " "$f" | cut -d' ' -f2 | cut -d'(' -f1 | sort | uniq -d)
  if [ -n "$dup" ]; then
    echo "✗ Duplicate in $f: $dup"
    exit 1
  fi
done

echo "→ Server test..."
python3 -m http.server 8080 &
PID=$!
sleep 2
curl -sf http://localhost:8080/ > /dev/null && echo "✓ Server OK" || { kill $PID; exit 1; }
kill $PID

echo "✅ All checks passed"