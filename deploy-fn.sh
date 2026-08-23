#!/bin/sh
# Deploy the firecrawl-ingest edge function and tee all output to a log file
# that Claude can read back (so you don't have to hunt for terminal output).
cd ~/plaster || exit 1
{
  echo "=== deploy started ==="
  npx supabase functions deploy firecrawl-ingest --project-ref lhetwgdlpulgnjetuope
  echo "=== deploy exit code: $? ==="
} 2>&1 | tee ~/plaster/deploy-fn.log
