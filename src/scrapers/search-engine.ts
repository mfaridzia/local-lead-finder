import { PlaywrightCrawler, LogLevel, log } from 'crawlee';
import { Lead, ScrapeOptions } from '../types/index.js';
import { normalizeIndonesianPhone } from '../utils/phone.js';
import crypto from 'node:crypto';

log.setLevel(LogLevel.INFO);

export interface SearchEngineOptions extends ScrapeOptions {
  type?: 'general' | 'instagram';
}

/**
 * Scrapes Search Engine via DuckDuckGo Lite (High reliability, clean HTML, zero bot-walls)
 */
export async function scrapeSearchEngine(options: SearchEngineOptions): Promise<Lead[]> {
  const { keyword, location, limit = 15, headless = true, type = 'general' } = options;

  let query = '';
  if (type === 'instagram') {
    query = `site:instagram.com ${keyword} ${location}`;
  } else {
    query = `${keyword} ${location} wa 08`;
  }

  const startUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const leads: Lead[] = [];
  const visitedUrls = new Set<string>();

  log.info(`[SearchEngine] Memulai pencarian ${type.toUpperCase()}: "${query}" via DuckDuckGo Lite`);

  const crawler = new PlaywrightCrawler({
    headless,
    maxRequestsPerCrawl: 5,
    launchContext: {
      launchOptions: {
        args: ['--ignore-certificate-errors', '--no-sandbox'],
      },
    },
    browserPoolOptions: {
      useFingerprints: true,
    },
    navigationTimeoutSecs: 30,
    async requestHandler({ page, request }) {
      log.info(`[SearchEngine] Membuka URL pencarian: ${request.url}`);

      // DuckDuckGo Lite layout: result links are in td.result-link a, snippets in td.result-snippet
      const resultRows = await page.$$('tr');
      log.info(`[SearchEngine] Memproses baris hasil DuckDuckGo Lite...`);

      for (let i = 0; i < resultRows.length; i++) {
        if (leads.length >= limit) break;

        try {
          const linkEl = await resultRows[i].$('a.result-link');
          if (!linkEl) continue;

          const title = (await linkEl.textContent())?.trim() || '';
          let href = (await linkEl.getAttribute('href'))?.trim() || '';

          // Clean duckduckgo redirect url: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
          if (href.includes('uddg=')) {
            const parsed = new URL(href.startsWith('http') ? href : `https:${href}`);
            href = decodeURIComponent(parsed.searchParams.get('uddg') || href);
          }

          // Next row usually contains snippet in DuckDuckGo Lite
          let snippet = '';
          if (i + 1 < resultRows.length) {
            const snippetEl = await resultRows[i + 1].$('td.result-snippet');
            if (snippetEl) {
              snippet = (await snippetEl.textContent())?.trim() || '';
            }
          }

          if (!title || !href || href.includes('duckduckgo.com') || visitedUrls.has(href)) {
            continue;
          }

          if (type === 'instagram' && !href.includes('instagram.com')) {
            continue;
          }

          visitedUrls.add(href);

          let cleanName = title;
          let instagramUrl: string | undefined = undefined;

          if (href.includes('instagram.com')) {
            instagramUrl = href;
            cleanName = title.replace(/•\s*Instagram.*$/i, '').replace(/\|\s*Instagram.*$/i, '').trim();
            const igMatch = cleanName.match(/^(.*?)\s*\(@([\w.]+)\)/);
            if (igMatch) {
              cleanName = igMatch[1].trim() || igMatch[2];
            }
          }

          // Search phone / WhatsApp in snippet & title
          const fullText = `${title} ${snippet}`;
          const phoneRegex = /(?:\+?62|08|628)[0-9\-\s]{8,14}/g;
          const phoneMatches = fullText.match(phoneRegex);
          let rawPhone: string | undefined = undefined;

          if (phoneMatches && phoneMatches.length > 0) {
            rawPhone = phoneMatches[0];
          }

          const { normalized: whatsappPhone, isMobileWhatsApp } = normalizeIndonesianPhone(rawPhone);
          const hasWebsite = !href.includes('instagram.com') && !href.includes('facebook.com');

          const lead: Lead = {
            id: crypto.randomUUID(),
            name: cleanName || `Bisnis #${leads.length + 1}`,
            category: keyword,
            address: location,
            phone: rawPhone,
            whatsappPhone: whatsappPhone || undefined,
            hasWhatsApp: isMobileWhatsApp,
            website: hasWebsite ? href : undefined,
            hasWebsite,
            instagramUrl,
            source: type === 'instagram' ? 'instagram' : 'search_dork',
            createdAt: new Date().toISOString(),
          };

          leads.push(lead);
          log.info(`[SearchEngine] [${leads.length}/${limit}] "${lead.name}" | WA: ${lead.whatsappPhone || '-'} | Source: ${lead.instagramUrl || lead.website}`);
        } catch {
          // ignore
        }
      }
    },
  });

  await crawler.run([startUrl]);
  return leads;
}
