#!/usr/bin/env bash
# Generates a complete concatenated markdown dump of the Plaster codebase.
# Output: scripts/plaster-dump.md

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO_ROOT/scripts/plaster-dump.md"

emit() {
  local file="$1"
  local rel="${file#$REPO_ROOT/}"
  local ext="${file##*.}"
  case "$ext" in
    ts|tsx)   lang="typescript" ;;
    js)       lang="javascript" ;;
    sql)      lang="sql" ;;
    json)     lang="json" ;;
    html)     lang="html" ;;
    css)      lang="css" ;;
    sh)       lang="bash" ;;
    md)       lang="markdown" ;;
    *)        lang="" ;;
  esac
  echo "## $rel" >> "$OUT"
  echo "" >> "$OUT"
  echo "\`\`\`$lang" >> "$OUT"
  cat "$file" >> "$OUT"
  echo "" >> "$OUT"
  echo "\`\`\`" >> "$OUT"
  echo "" >> "$OUT"
}

echo "# Plaster — Complete Codebase Dump" > "$OUT"
echo "Generated: $(date)" >> "$OUT"
echo "" >> "$OUT"

# src/
while IFS= read -r -d '' f; do
  emit "$f"
done < <(find "$REPO_ROOT/src" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -print0 | sort -z)

# supabase/migrations/
while IFS= read -r -d '' f; do
  emit "$f"
done < <(find "$REPO_ROOT/supabase/migrations" -type f -name "*.sql" -print0 | sort -z)

# supabase/functions/
while IFS= read -r -d '' f; do
  emit "$f"
done < <(find "$REPO_ROOT/supabase/functions" -type f -print0 2>/dev/null | sort -z)

# Config files
for f in \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/tsconfig.json" \
  "$REPO_ROOT/vite.config.ts" \
  "$REPO_ROOT/capacitor.config.ts" \
  "$REPO_ROOT/index.html" \
  "$REPO_ROOT/tailwind.config.js" \
  "$REPO_ROOT/README.md"; do
  [ -f "$f" ] && emit "$f"
done

echo "Done: $OUT"
