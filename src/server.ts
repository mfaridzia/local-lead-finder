import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { scrapeGoogleMaps } from './scrapers/gmaps.js';
import { scrapeSearchEngine } from './scrapers/search-engine.js';
import { qualifyBatch } from './ai/qualifier.js';
import { createWhatsAppUrl } from './utils/phone.js';
import { Lead } from './types/index.js';

dotenv.config();

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3000', 10);
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Enable CORS for all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function saveLeadsToDisk(leads: Lead[], prefix: string): { jsonFile: string; csvFile: string; filename: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.json`;
  const jsonPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2), 'utf-8');

  const csvFilename = `${prefix}-${timestamp}.csv`;
  const csvPath = path.join(OUTPUT_DIR, csvFilename);
  const headers = ['Nama', 'Kategori', 'No Telepon', 'WhatsApp', 'Punya Website?', 'Rating', 'Review', 'AI Score', 'Alamat', 'Link WA Direct', 'Link Source'];
  
  const rows = leads.map((l) => [
    `"${l.name.replace(/"/g, '""')}"`,
    `"${l.category || ''}"`,
    `"${l.phone || ''}"`,
    `"${l.whatsappPhone || ''}"`,
    l.hasWebsite ? 'Ya' : 'TIDAK',
    l.rating || '',
    l.reviewCount || '',
    l.qualification?.score || '',
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${l.whatsappPhone ? createWhatsAppUrl(l.whatsappPhone, l.qualification?.outreachMessage || `Halo kak ${l.name}...`) : ''}"`,
    `"${l.googleMapsUrl || l.instagramUrl || l.website || ''}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf-8');

  return { jsonFile: jsonPath, csvFile: csvPath, filename };
}

// Serve static index.html
app.get('/', (c) => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
  return c.html(html);
});

// List output JSON files
app.get('/api/files', (c) => {
  if (!fs.existsSync(OUTPUT_DIR)) return c.json([]);
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  return c.json(files);
});

// Get leads from a specific file
app.get('/api/leads', (c) => {
  const filename = c.req.query('file');
  if (!filename) return c.json({ error: 'file param is required' }, 400);

  const filePath = path.join(OUTPUT_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) return c.json({ error: 'File not found' }, 404);

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const leads = JSON.parse(raw);
    return c.json(leads);
  } catch (err) {
    return c.json({ error: 'Failed to parse JSON file' }, 500);
  }
});

// Trigger a new scrape & AI qualification
app.post('/api/scrape', async (c) => {
  try {
    const body = await c.req.json<{
      source: 'gmaps' | 'search';
      keyword: string;
      location: string;
      max?: number;
    }>();

    const { source = 'gmaps', keyword, location, max = 15 } = body;
    if (!keyword || !location) {
      return c.json({ error: 'Keyword dan lokasi wajib diisi' }, 400);
    }

    console.log(`\n[API Scrape] Memulai pencarian ${source}: "${keyword}" di "${location}" (max: ${max})...`);

    let leads: Lead[] = [];
    if (source === 'gmaps') {
      leads = await scrapeGoogleMaps({ keyword, location, limit: max, headless: true });
    } else {
      leads = await scrapeSearchEngine({ keyword, location, limit: max, headless: true, type: 'general' });
    }

    if (leads.length === 0) {
      return c.json({ message: 'Tidak ditemukan leads untuk pencarian tersebut', leads: [] });
    }

    console.log(`[API Scrape] Berhasil mengambil ${leads.length} leads. Menjalankan kualifikasi DeepSeek AI...`);
    const qualifiedLeads = await qualifyBatch(leads);

    const prefix = `${source}-${keyword.replace(/[^a-zA-Z0-9]/g, '_')}-${location.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const { filename } = saveLeadsToDisk(qualifiedLeads, prefix);

    console.log(`[API Scrape] Selesai & tersimpan ke ${filename}`);
    return c.json({ filename, leads: qualifiedLeads });
  } catch (err) {
    console.error('[API Scrape Error]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Terjadi kesalahan saat scraping' }, 500);
  }
});

// Qualify existing leads in a file with DeepSeek AI
app.post('/api/qualify', async (c) => {
  try {
    const body = await c.req.json<{ filename: string }>();
    const filename = body.filename;
    if (!filename) return c.json({ error: 'filename is required' }, 400);

    const filePath = path.join(OUTPUT_DIR, path.basename(filename));
    if (!fs.existsSync(filePath)) return c.json({ error: 'File not found' }, 404);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const leads: Lead[] = JSON.parse(raw);

    console.log(`[API Qualify] Mengkualifikasi ${leads.length} leads dari file ${filename}...`);
    const updated = await qualifyBatch(leads);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');

    return c.json(updated);
  } catch (err) {
    console.error('[API Qualify Error]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Gagal mengkualifikasi data' }, 500);
  }
});

console.log(`\n🚀 Lead Finder Dashboard aktif di: http://localhost:${PORT}\n`);
serve({
  fetch: app.fetch,
  port: PORT,
});
