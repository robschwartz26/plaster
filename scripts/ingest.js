#!/usr/bin/env node
/**
 * Plaster — AI Poster Ingestion Script
 *
 * Usage: node scripts/ingest.js ~/Desktop/posters/
 *
 * Reads every jpg/jpeg/png/webp from the given folder, uses Claude vision
 * to extract event details, optimizes the image with sharp, uploads it to
 * Supabase storage, and inserts the event (and venue if needed) into the DB.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local from the project root (one level up from scripts/)
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY,
  ANTHROPIC_API_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required environment variables. Check .env.local:');
  if (!SUPABASE_URL)          console.error('  - VITE_SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY)  console.error('  - VITE_SUPABASE_SERVICE_KEY');
  if (!ANTHROPIC_API_KEY)     console.error('  - ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VALID_CATEGORIES = ['Music', 'Drag', 'Dance', 'Comedy', 'Art', 'Film', 'Literary', 'Trivia', 'Other'];
const CURRENT_YEAR = new Date().getFullYear();

// ── Timestamp helpers ──────────────────────────────────────────────────────────

/**
 * Portland uses PDT (UTC-7) from mid-March through early November, PST (UTC-8)
 * otherwise. We apply a simple month-based heuristic since we don't know the
 * exact DST boundary for a given year.
 */
function portlandOffset(dateStr) {
  const month = parseInt(dateStr.split('-')[1], 10);
  return month >= 3 && month <= 10 ? '-07:00' : '-08:00';
}

function buildTimestamp(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || '00:00';
  // Validate the date string looks like YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const combined = `${dateStr}T${time}:00`;
  const probe = new Date(combined);
  if (isNaN(probe.getTime())) return null;
  return `${combined}${portlandOffset(dateStr)}`;
}

// ── Claude vision extraction ───────────────────────────────────────────────────

async function extractEventData(imageBuffer, filename) {
  const base64 = imageBuffer.toString('base64');
  const ext = extname(filename).slice(1).toLowerCase();
  const mediaType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg';

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `You are extracting event details from an event poster for a Portland, Oregon events discovery app.

Respond with ONLY a valid JSON object — no markdown fences, no explanation, nothing else.

{
  "title": string | null,
  "venue_name": string | null,
  "date": string | null,
  "time": string | null,
  "address": string | null,
  "category": string,
  "description": string | null,
  "uncertain_fields": string[]
}

Field rules:
- title: The main event or performer name. null only if truly unreadable.
- venue_name: Name of the venue or location. null if absent.
- date: ISO format YYYY-MM-DD. Assume year ${CURRENT_YEAR} if only month/day are shown. null if no date is visible.
- time: 24-hour HH:MM (e.g. "20:00"). null if no time is shown.
- address: Full street address if visible, otherwise null.
- category: Must be exactly one of: Music, Drag, Dance, Comedy, Art, Film, Literary, Trivia, Other. Pick the best fit.
- description: 1–3 sentences synthesized from any descriptive text on the poster. null if there is nothing to work with.
- uncertain_fields: Array of field names you are not confident about (e.g. ["date", "time"]). Empty array if you are confident in everything.`,
          },
        ],
      },
    ],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/^```[a-z]*\n?/gi, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Image optimization ─────────────────────────────────────────────────────────

async function optimizeImage(buffer) {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ── Supabase helpers ───────────────────────────────────────────────────────────

async function uploadPoster(buffer) {
  const storagePath = `ingest/${randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from('posters')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('posters').getPublicUrl(storagePath);
  return publicUrl;
}

async function findOrCreateVenue(venueName, address) {
  if (!venueName) return null;

  // Case-insensitive name match
  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', venueName.trim())
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create a new venue row (created_by is intentionally null for script ingestion)
  const { data: created, error } = await supabase
    .from('venues')
    .insert({ name: venueName.trim(), address: address || null })
    .select('id')
    .single();

  if (error) throw new Error(`Venue creation failed for "${venueName}": ${error.message}`);
  return created.id;
}

async function insertEvent({ title, venueId, description, category, posterUrl, startsAt, address }) {
  const { error } = await supabase.from('events').insert({
    title,
    venue_id: venueId,
    description: description || null,
    category,
    poster_url: posterUrl,
    starts_at: startsAt,
    address: address || null,
  });
  if (error) throw new Error(`Event insert failed: ${error.message}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    console.error('Usage: node scripts/ingest.js <folder-path>');
    console.error('Example: node scripts/ingest.js ~/Desktop/posters/');
    process.exit(1);
  }

  // Expand ~ manually in case the shell didn't
  const expanded = folderArg.replace(/^~/, process.env.HOME ?? '');
  const folderPath = resolve(expanded);

  let files;
  try {
    files = await readdir(folderPath);
  } catch {
    console.error(`Cannot read folder: ${folderPath}`);
    process.exit(1);
  }

  const imageFiles = files
    .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort();

  if (imageFiles.length === 0) {
    console.log('No image files (jpg, jpeg, png, webp) found in that folder.');
    process.exit(0);
  }

  console.log(`Found ${imageFiles.length} image${imageFiles.length !== 1 ? 's' : ''} to process.\n`);

  const needsReview = [];
  let processedCount = 0;

  for (const filename of imageFiles) {
    const filePath = join(folderPath, filename);
    process.stdout.write(`Processing: ${filename} … `);

    try {
      const rawBuffer = await readFile(filePath);

      // 1. Claude vision extraction
      let extracted;
      try {
        extracted = await extractEventData(rawBuffer, filename);
      } catch (err) {
        console.log('✗');
        console.log(`  Claude extraction failed: ${err.message}`);
        needsReview.push({ filename, reason: `Extraction failed: ${err.message}` });
        continue;
      }

      // Normalize category
      const category = VALID_CATEGORIES.includes(extracted.category)
        ? extracted.category
        : 'Other';

      // Build timestamp — date is required for a valid insert
      const startsAt = buildTimestamp(extracted.date, extracted.time);
      if (!startsAt) {
        console.log('✗');
        console.log(`  No parseable date found.`);
        needsReview.push({ filename, reason: 'No parseable date', extracted });
        continue;
      }

      // 2. Optimize image
      const optimized = await optimizeImage(rawBuffer);

      // 3. Upload poster
      const posterUrl = await uploadPoster(optimized);

      // 4. Venue lookup / create
      const venueId = await findOrCreateVenue(extracted.venue_name, extracted.address);

      // 5. Insert event
      const title = extracted.title || basename(filename, extname(filename));
      await insertEvent({
        title,
        venueId,
        description: extracted.description,
        category,
        posterUrl,
        startsAt,
        address: extracted.address,
      });

      processedCount++;
      console.log('✓');
      console.log(`  ✓ Processed: ${title} at ${extracted.venue_name ?? '(no venue)'}`);

      // Flag for review if Claude was uncertain about any fields
      const uncertain = extracted.uncertain_fields ?? [];
      if (uncertain.length > 0) {
        console.log(`  ↳ Uncertain fields: ${uncertain.join(', ')} — added to needs_review.json`);
        needsReview.push({
          filename,
          reason: 'Uncertain fields',
          uncertain_fields: uncertain,
          extracted,
        });
      }

    } catch (err) {
      console.log('✗');
      console.log(`  Error: ${err.message}`);
      needsReview.push({ filename, reason: err.message });
    }

    console.log();
  }

  // Write needs_review.json if there is anything to flag
  if (needsReview.length > 0) {
    const reviewPath = join(__dirname, '..', 'needs_review.json');
    await writeFile(reviewPath, JSON.stringify(needsReview, null, 2), 'utf8');
    console.log(`Needs-review file written to: needs_review.json\n`);
  }

  console.log(`── Summary ${'─'.repeat(39)}`);
  console.log(`Processed ${processedCount} event${processedCount !== 1 ? 's' : ''}, ${needsReview.length} need${needsReview.length !== 1 ? '' : 's'} review`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
