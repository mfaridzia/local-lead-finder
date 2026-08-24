import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { scrapeGoogleMaps } from './scrapers/gmaps.js';
import { scrapeSearchEngine } from './scrapers/search-engine.js';
import { scrapeInstagram } from './scrapers/instagram.js';
import { createWhatsAppUrl } from './utils/phone.js';
import { Lead } from './types/index.js';

const program = new Command();

program
  .name('lead-finder')
  .description('Automated Lead Finder across Google Maps, Google Search, and Instagram')
  .version('1.0.0');

function ensureOutputDir(): string {
  const outDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  return outDir;
}

function saveLeadsToFile(leads: Lead[], prefix: string): { jsonFile: string; csvFile: string } {
  const outDir = ensureOutputDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const jsonFile = path.join(outDir, `${prefix}-${timestamp}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(leads, null, 2), 'utf-8');

  const csvFile = path.join(outDir, `${prefix}-${timestamp}.csv`);
  const headers = ['Nama', 'Kategori', 'No Telepon', 'WhatsApp', 'Punya Website?', 'Rating', 'Review', 'Alamat', 'Link WA Direct', 'Link Source'];
  
  const rows = leads.map((l) => [
    `"${l.name.replace(/"/g, '""')}"`,
    `"${l.category || ''}"`,
    `"${l.phone || ''}"`,
    `"${l.whatsappPhone || ''}"`,
    l.hasWebsite ? 'Ya' : 'TIDAK',
    l.rating || '',
    l.reviewCount || '',
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${l.whatsappPhone ? createWhatsAppUrl(l.whatsappPhone, `Halo kak ${l.name}, saya melihat profil usahanya...`) : ''}"`,
    `"${l.googleMapsUrl || l.instagramUrl || l.website || ''}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  fs.writeFileSync(csvFile, csvContent, 'utf-8');

  return { jsonFile, csvFile };
}

// 1. Google Maps
program
  .command('gmaps')
  .description('Cari lead bisnis lokal dari Google Maps')
  .requiredOption('-k, --keyword <keyword>', 'Keyword bisnis (cth: "bakery", "laundry", "barbershop")')
  .requiredOption('-l, --location <location>', 'Kota atau area (cth: "Mataram", "Denpasar")')
  .option('-m, --max <number>', 'Jumlah maksimal lead', '15')
  .option('--no-headless', 'Jalankan browser dengan UI terbuka (bukan headless)')
  .action(async (options) => {
    console.log(`\n🔍 [Lead Finder] Memulai pencarian Google Maps: "${options.keyword}" di "${options.location}"...\n`);
    
    try {
      const leads = await scrapeGoogleMaps({
        keyword: options.keyword,
        location: options.location,
        limit: parseInt(options.max, 10),
        headless: options.headless,
      });

      console.log(`\n================== HASIL PENCARIAN GOOGLE MAPS (${leads.length} LEADS) ==================`);
      leads.forEach((lead, i) => {
        console.log(`${i + 1}. [${lead.hasWebsite ? '🌐 ADA WEB' : '❌ TANPA WEB'}] ${lead.name}`);
        console.log(`   📞 Telp: ${lead.phone || '-'} | WA: ${lead.whatsappPhone || '-'}`);
        console.log(`   ⭐ Rating: ${lead.rating || '-'} (${lead.reviewCount || 0} ulasan)`);
        if (lead.whatsappPhone) {
          console.log(`   💬 Link WA: ${createWhatsAppUrl(lead.whatsappPhone, `Halo kak ${lead.name}, saya melihat profil usahanya...`)}`);
        }
        console.log('---');
      });

      const { jsonFile, csvFile } = saveLeadsToFile(leads, `gmaps-${options.keyword}-${options.location}`);
      console.log(`\n✅ Hasil tersimpan di:\n   - JSON: ${jsonFile}\n   - CSV:  ${csvFile}`);
    } catch (err) {
      console.error('❌ Terjadi kesalahan:', err);
    }
  });

// 2. Search Engine Dorking (Google Search)
program
  .command('search')
  .description('Cari lead bisnis lokal via Google Search Dorking (mengekstrak website independen & no WA)')
  .requiredOption('-k, --keyword <keyword>', 'Keyword bisnis (cth: "katering", "fotografer")')
  .requiredOption('-l, --location <location>', 'Kota atau area (cth: "Mataram")')
  .option('-m, --max <number>', 'Jumlah maksimal lead', '10')
  .option('--no-headless', 'Jalankan browser dengan UI terbuka')
  .action(async (options) => {
    console.log(`\n🔍 [Lead Finder] Memulai pencarian Google Search: "${options.keyword}" di "${options.location}"...\n`);

    try {
      const leads = await scrapeSearchEngine({
        keyword: options.keyword,
        location: options.location,
        limit: parseInt(options.max, 10),
        headless: options.headless,
        type: 'general',
      });

      console.log(`\n================== HASIL GOOGLE SEARCH (${leads.length} LEADS) ==================`);
      leads.forEach((lead, i) => {
        console.log(`${i + 1}. ${lead.name}`);
        console.log(`   📞 WA: ${lead.whatsappPhone || lead.phone || '-'}`);
        console.log(`   🌐 Web: ${lead.website || '-'}`);
        if (lead.whatsappPhone) {
          console.log(`   💬 Link WA: ${createWhatsAppUrl(lead.whatsappPhone, `Halo kak ${lead.name}, saya melihat profil usahanya...`)}`);
        }
        console.log('---');
      });

      const { jsonFile, csvFile } = saveLeadsToFile(leads, `search-${options.keyword}-${options.location}`);
      console.log(`\n✅ Hasil tersimpan di:\n   - JSON: ${jsonFile}\n   - CSV:  ${csvFile}`);
    } catch (err) {
      console.error('❌ Terjadi kesalahan:', err);
    }
  });

// 3. Instagram Scraper
program
  .command('ig')
  .description('Cari akun Instagram bisnis & ekstrak no WhatsApp dari bio')
  .requiredOption('-k, --keyword <keyword>', 'Keyword bisnis (cth: "katering", "toko kue", "mua")')
  .requiredOption('-l, --location <location>', 'Kota atau area (cth: "Mataram")')
  .option('-m, --max <number>', 'Jumlah maksimal lead', '10')
  .option('--no-headless', 'Jalankan browser dengan UI terbuka')
  .action(async (options) => {
    console.log(`\n📸 [Lead Finder] Memulai pencarian Instagram: "${options.keyword}" di "${options.location}"...\n`);

    try {
      const leads = await scrapeInstagram({
        keyword: options.keyword,
        location: options.location,
        limit: parseInt(options.max, 10),
        headless: options.headless,
      });

      console.log(`\n================== HASIL INSTAGRAM (${leads.length} LEADS) ==================`);
      leads.forEach((lead, i) => {
        console.log(`${i + 1}. ${lead.name}`);
        console.log(`   📱 WA: ${lead.whatsappPhone || '-'}`);
        console.log(`   🔗 Profile: ${lead.instagramUrl || '-'}`);
        console.log(`   🌐 Link di Bio: ${lead.website || '-'}`);
        if (lead.whatsappPhone) {
          console.log(`   💬 Link WA: ${createWhatsAppUrl(lead.whatsappPhone, `Halo kak ${lead.name}, saya melihat portofolio di Instagram kakak...`)}`);
        }
        console.log('---');
      });

      const { jsonFile, csvFile } = saveLeadsToFile(leads, `ig-${options.keyword}-${options.location}`);
      console.log(`\n✅ Hasil tersimpan di:\n   - JSON: ${jsonFile}\n   - CSV:  ${csvFile}`);
    } catch (err) {
      console.error('❌ Terjadi kesalahan:', err);
    }
  });

program.parse(process.argv);
