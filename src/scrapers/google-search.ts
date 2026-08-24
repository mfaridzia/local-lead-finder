import { PlaywrightCrawler, LogLevel, log } from 'crawlee';
import { Lead, ScrapeOptions } from '../types/index.js';
import { normalizeIndonesianPhone } from '../utils/phone.js';
import crypto from 'node:crypto';

log.setLevel(LogLevel.INFO);

export interface GoogleSearchOptions extends ScrapeOptions {
  type?: 'general' | 'instagram';
}

/**
 * Scrapes Google Search with Dorking to find local businesses or Instagram profiles with contact info
 */
export async function scrapeGoogleSearch(options: GoogleSearchOptions): Promise<Lead[]> {
  const { keyword, location, limit = 15, headless = true, type = 'general' } = options;

  let query = '';
  if (type === 'instagram') {
    query = `site:instagram.com ${keyword} ${location} wa`;
  } else {
    query = `${keyword} ${location} wa 08 -site:tokopedia.com -site:shopee.co.id`;
  }

  const startUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id&num=${Math.min(limit + 10, 50)}`;
  const leads: Lead[] = [];
  const visitedUrls = new Set<string>();

  log.info(`[GoogleSearch] Memulai scraping ${type.toUpperCase()}: "${query}" (Target: ${limit} leads)`);

  const crawler = new PlaywrightCrawler({
    headless,
    maxRequestsPerCrawl: 5,
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
    navigationTimeoutSecs: 45,
    async requestHandler({ page, request }) {
      log.info(`[GoogleSearch] Membuka URL pencarian: ${request.url}`);

      // Handle Google Cookie Consent / CAPTCHA check
      try {
        const consentButtons = [
          'button:has-text("Saya setuju")',
          'button:has-text("Terima semua")',
          'button:has-text("Accept all")',
          'button:has-text("I agree")',
          'form[action*="consent"] button',
          'div[role="dialog"] button'
        ];
        for (const btnSelector of consentButtons) {
          const btn = page.locator(btnSelector).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            log.info(`[GoogleSearch] Mengklik tombol consent: ${btnSelector}`);
            await btn.click();
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1500);
            break;
          }
        }
      } catch {
        // Ignore consent errors
      }

      // Wait for results
      await page.waitForTimeout(2000);

      const pageTitle = await page.title();
      log.info(`[GoogleSearch] Judul halaman: "${pageTitle}" | URL: ${page.url()}`);

      // Extract all organic result links from page
      const organicLinks = await page.$$('a[href^="http"]:not([href*="google."]):not([href*="youtube."])');
      log.info(`[GoogleSearch] Menemukan ${organicLinks.length} tautan eksternal.`);

      for (const [index, linkEl] of organicLinks.entries()) {
        if (leads.length >= limit) break;

        const href = await linkEl.getAttribute('href') || '';
        if (!href || visitedUrls.has(href)) continue;

        // Parent container text
        const containerText = await linkEl.evaluate((el) => {
          const parent = el.closest('div.g, div.MjjYud, div.tF2Cxc, li, div') || el;
          return parent.textContent || '';
        }).catch(() => '');

        const linkTitle = (await linkEl.textContent())?.trim() || '';
        if (linkTitle.length < 3) continue;

        visitedUrls.add(href);

        let cleanName = linkTitle.split('\n')[0].trim();
        let instagramUrl: string | undefined = undefined;

        if (href.includes('instagram.com')) {
          instagramUrl = href;
          const igMatch = cleanName.match(/^(.*?)\s*\(@([\w.]+)\)/);
          if (igMatch) {
            cleanName = igMatch[1].trim() || igMatch[2];
          }
        }

        // Search phone / WhatsApp in container text
        const phoneRegex = /(?:\+?62|08|628)[0-9\-\s]{8,14}/g;
        const phoneMatches = containerText.match(phoneRegex);
        let rawPhone: string | undefined = undefined;

        if (phoneMatches && phoneMatches.length > 0) {
          rawPhone = phoneMatches[0];
        }

        const { normalized: whatsappPhone, isMobileWhatsApp } = normalizeIndonesianPhone(rawPhone);
        const hasWebsite = !href.includes('instagram.com') && !href.includes('facebook.com');

        const lead: Lead = {
          id: crypto.randomUUID(),
          name: cleanName || `Bisnis #${index + 1}`,
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
        log.info(`[GoogleSearch] [${leads.length}/${limit}] "${lead.name}" | WA: ${lead.whatsappPhone || '-'} | Web: ${lead.website || lead.instagramUrl}`);
      }
    },
  });

  await crawler.run([startUrl]);
  return leads;
}
