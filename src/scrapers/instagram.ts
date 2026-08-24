import { PlaywrightCrawler, LogLevel, log } from 'crawlee';
import { Lead, ScrapeOptions } from '../types/index.js';
import { normalizeIndonesianPhone } from '../utils/phone.js';
import { scrapeSearchEngine } from './search-engine.js';
import crypto from 'node:crypto';

log.setLevel(LogLevel.INFO);

export interface InstagramScrapeOptions extends ScrapeOptions {
  profileUrls?: string[];
}

/**
 * Scrapes Instagram profiles for contact details (Bio, WhatsApp, Link in Bio, Email)
 */
export async function scrapeInstagram(options: InstagramScrapeOptions): Promise<Lead[]> {
  const { keyword, location, limit = 10, headless = true, profileUrls } = options;

  // Step 1: Find IG profile URLs via search engine dorking
  let targets: string[] = profileUrls || [];

  if (targets.length === 0) {
    log.info(`[Instagram] Mencari profil Instagram untuk "${keyword}" di "${location}"...`);
    const searchLeads = await scrapeSearchEngine({
      keyword,
      location,
      limit,
      headless,
      type: 'instagram',
    });

    targets = searchLeads
      .map((l) => l.instagramUrl)
      .filter((url): url is string => Boolean(url && url.includes('instagram.com/')));

    if (targets.length === 0) {
      log.warning('[Instagram] Tidak ditemukan profil Instagram dari hasil pencarian.');
      return searchLeads;
    }
  }

  log.info(`[Instagram] Mengambil detail dari ${targets.length} akun Instagram...`);
  const enrichedLeads: Lead[] = [];

  const crawler = new PlaywrightCrawler({
    headless,
    maxRequestsPerCrawl: targets.length + 5,
    launchContext: {
      launchOptions: {
        args: [
          '--ignore-certificate-errors',
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
      },
    },
    browserPoolOptions: {
      useFingerprints: true,
    },
    navigationTimeoutSecs: 30,
    async requestHandler({ page, request }) {
      log.info(`[Instagram] Membuka profil: ${request.url}`);
      await page.waitForTimeout(Math.floor(Math.random() * 1500 + 1500)); // anti-ban delay

      // Extract username from URL
      const urlObj = new URL(request.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const username = pathParts[0] || 'Instagram Business';

      // Extract bio text
      const pageText = await page.locator('main, header, article, body').allTextContents().catch(() => []) || [];
      const fullText = pageText.join(' ');

      // Extract bio external links
      const externalLinks = await page.locator('header a[href*="l.instagram.com"], header a[target="_blank"]').all();
      let externalUrl: string | undefined = undefined;
      for (const el of externalLinks) {
        const rawHref = await el.getAttribute('href');
        if (rawHref) {
          if (rawHref.includes('u=')) {
            const parsed = new URL(rawHref, 'https://instagram.com');
            externalUrl = decodeURIComponent(parsed.searchParams.get('u') || rawHref);
          } else {
            externalUrl = rawHref;
          }
          break;
        }
      }

      // Search for Indonesian phone numbers inside bio text
      const phoneRegex = /(?:\+?62|08|628)[0-9\-\s]{8,14}/g;
      const phoneMatches = fullText.match(phoneRegex);
      let rawPhone: string | undefined = undefined;

      if (phoneMatches && phoneMatches.length > 0) {
        rawPhone = phoneMatches[0];
      }

      if (!rawPhone && externalUrl?.includes('wa.me/')) {
        const waMatch = externalUrl.match(/wa\.me\/([0-9]+)/);
        if (waMatch) rawPhone = waMatch[1];
      }

      const { normalized: whatsappPhone, isMobileWhatsApp } = normalizeIndonesianPhone(rawPhone);

      const hasActualWebsite = Boolean(
        externalUrl &&
        !externalUrl.includes('linktr.ee') &&
        !externalUrl.includes('wa.me') &&
        !externalUrl.includes('bit.ly') &&
        !externalUrl.includes('shopee') &&
        !externalUrl.includes('tokopedia')
      );

      const lead: Lead = {
        id: crypto.randomUUID(),
        name: `@${username}`,
        category: keyword,
        address: location,
        phone: rawPhone,
        whatsappPhone: whatsappPhone || undefined,
        hasWhatsApp: isMobileWhatsApp,
        website: hasActualWebsite ? externalUrl : undefined,
        hasWebsite: hasActualWebsite,
        instagramUrl: request.url,
        source: 'instagram',
        createdAt: new Date().toISOString(),
      };

      enrichedLeads.push(lead);
      log.info(`[Instagram] [${enrichedLeads.length}/${targets.length}] "${lead.name}" | WA: ${lead.whatsappPhone || '-'} | Web: ${externalUrl || '-'}`);
    },
  });

  await crawler.run(targets.slice(0, limit));
  return enrichedLeads;
}
