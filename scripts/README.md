# Plaster — AI Poster Ingestion Script

Bulk-import event posters using Claude vision. Drop a folder of poster images and the script will:

1. Send each image to Claude (`claude-opus-4-6`) to extract event title, venue, date, time, address, category, and description
2. Resize and optimize the image to max 1200 px / 85 % JPEG quality via `sharp`
3. Upload the optimized image to the `posters` Supabase Storage bucket
4. Look up the venue by name — create it if it doesn't exist yet
5. Insert the event row into the `events` table
6. Write any uncertain or failed extractions to `needs_review.json`

---

## Setup

### 1. Add your Anthropic API key to `.env.local`

```
ANTHROPIC_API_KEY=sk-ant-...
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_SERVICE_KEY` are already expected in `.env.local` — the script uses the service key to bypass RLS.

### 2. Install dependencies (already done if you ran `npm install`)

```bash
npm install
```

The script requires `@anthropic-ai/sdk`, `sharp`, and `dotenv` — all listed in `package.json`.

---

## Usage

Run from the **project root**:

```bash
node scripts/ingest.js ~/Desktop/posters/
```

Supported image formats: `jpg`, `jpeg`, `png`, `webp`.

### Example output

```
Found 4 images to process.

Processing: fri-night-dj.jpg … ✓
  ✓ Processed: Friday Night with DJ Lux at Holocene
  ↳ Uncertain fields: time — added to needs_review.json

Processing: comedy-show.png … ✓
  ✓ Processed: Open Mic Night at Celt's Pub

Processing: blurry-poster.jpg … ✗
  Claude extraction failed: No parseable date

Processing: art-opening.webp … ✓
  ✓ Processed: Spring Invitational at Nationale

Needs-review file written to: needs_review.json

── Summary ───────────────────────────────────────
Processed 3 events, 2 need review
```

---

## needs_review.json

Created (or overwritten) in the project root whenever any image couldn't be fully processed or Claude flagged uncertainty. Each entry contains:

| Field | Description |
|-------|-------------|
| `filename` | Original image filename |
| `reason` | Why it was flagged (`Uncertain fields`, `No parseable date`, `Extraction failed`, etc.) |
| `uncertain_fields` | Which fields Claude wasn't confident about (if applicable) |
| `extracted` | The raw Claude output for manual correction (if applicable) |

Manually review these entries, correct the data in the Supabase dashboard, and re-upload the image if needed.

---

## Category values

Claude will pick the best match from:

`Music` · `Drag` · `Dance` · `Comedy` · `Art` · `Film` · `Literary` · `Trivia` · `Other`

---

## Notes

- The script uses the **service key** — it bypasses Row Level Security. Keep `.env.local` out of version control (it's in `.gitignore`).
- Uploaded images go to `posters/ingest/<uuid>.jpg` in Supabase Storage.
- Venues are matched **case-insensitively** by name. If a venue already exists it will be reused; otherwise a new row is created with `created_by = null`.
- Timestamps are stored in Portland local time (PDT UTC-7 or PST UTC-8 based on month) and converted to UTC by Postgres.
