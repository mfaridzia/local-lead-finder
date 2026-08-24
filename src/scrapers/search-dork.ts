import { PlaywrightCrawler, LogLevel, log } from 'crawlee';
import { Lead, ScrapeOptions } from '../types/index.js';
import { normalizeIndonesianPhone } from '../utils/phone.js';
import crypto from 'node:crypto';

log.setLevel(LogLevel.INFO);

/**
 * Scrapes DuckDuckGo / Search Dorking for Instagram profiles & businesses with WhatsApp numbers
 * Example query: site:instagram.com "katering" "mataram" "08"
 */
export async function scrapeSearchDork(options: ScrapeOptions & { targetPlatform?: 'instagram' | 'general' }): Promise<Lead[]> {
  const { keyword, location, limit = 20, headless = true, targetPlatform = 'instagram' } = options;
  
  let dorkQuery = '';
  if (targetPlatform === 'instagram') {
    dorkQuery = `site:instagram.com "${keyword}" "${location}" "08"`;
  } else {
    dorkQuery = `"${keyword}" "${location}" "08" -site:tokopedia.com -site:shopee.co.id`;
  }

  const startUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(dorkQuery)}`;
  const leads: Lead[] = [];

  log.info(`[SearchDork] Memulai pencarian Dorking: "${dorkQuery}" (Target: ${limit} leads)`);

  const crawler = new PlaywrightCrawler({
    headless,
    maxRequestsPerCrawl: 10,
    launchContext: {
      launchOptions: {
        args: ['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'],
      },
    },
    browserPoolOptions: {
      useFingerprints: true,
    },
    preNavigationHooks: [
      async ({ page }) => {
        // Ignore SSL errors at context level
      },
    ],
    navigationTimeoutSecs: 45,
    async requestHandler({ page, request }) {
      log.info(`[SearchDork] Membuka URL pencarian: ${request.url}`);

      // DuckDuckGo HTML results
      const results = await page.$$('.result');
      log.info(`[SearchDork] Ditemukan ${results.length} hasil pencarian.`);

      for (const [index, resultEl] of results.entries()) {
        if (leads.length >= limit) break;

        const title = await resultEl.$eval('.result__title', (el) => el.textContent?.trim() || '').catch(() => '');
        const snippet = await resultEl.$eval('.result__snippet', (el) => el.textContent?.trim() || '').catch(() => '');
        const href = await resultEl.$eval('.result__url', (el) => el.getAttribute('href')?.trim() || '').catch(() => '');

        if (!title && !snippet) continue;

        // Clean Instagram title: "Nama Bisnis (@username) • Instagram photos and videos"
        let cleanName = title.replace(/•\s*Instagram.*$/i, '').trim();
        let instagramUrl: string | undefined = undefined;

        if (href.includes('instagram.com')) {
          instagramUrl = href.startsWith('http') ? href : `https://${href}`;
          // Clean username from title
          const igMatch = title.match(/^(.*?)\s*\(@([\w.]+)\)/);
          if (igMatch) {
            cleanName = igMatch[1].trim() || igMatch[2];
          }
        }

        // Search for Indonesian phone numbers inside snippet / title
        const phoneRegex = /(?:\+?62|08|628)[0-9\-\s]{8,14}/g;
        const fullText = `${title} ${snippet}`;
        const phoneMatches = fullText.match(phoneRegex);
        
        let rawPhone: string | undefined = undefined;
        if (phoneMatches && phoneMatches.length > 0) {
          rawPhone = phoneMatches[0];
        }

        const { normalized: whatsappPhone, isMobileWhatsApp } = normalizeIndonesianPhone(rawPhone);

        const lead: Lead = {
          id: crypto.randomUUID(),
          name: cleanName || `Prospek #${index + 1}`,
          category: keyword,
          address: location,
          phone: rawPhone,
          whatsappPhone: whatsappPhone || undefined,
          hasWhatsApp: isMobileWhatsApp,
          website: targetPlatform === 'general' ? href : undefined,
          hasWebsite: targetPlatform === 'general',
          instagramUrl,
          source: 'search_dork',
          createdAt: new Date().toISOString(),
        };

        leads.push(lead);
        log.info(`[SearchDork] [${leads.length}/${limit}] "${lead.name}" | WA: ${lead.whatsappPhone || 'Tidak ada'} | URL: ${instagramUrl || href}`);
      }
    },
  });

  await crawler.run([startUrl]);
  return leads;
}
