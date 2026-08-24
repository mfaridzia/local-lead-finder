import { PlaywrightCrawler, LogLevel, log } from 'crawlee';
import { Lead, ScrapeOptions } from '../types/index.js';
import { normalizeIndonesianPhone } from '../utils/phone.js';
import crypto from 'node:crypto';

log.setLevel(LogLevel.INFO);

/**
 * Scrapes Google Maps business listings using Crawlee + Playwright with anti-bot precautions
 */
export async function scrapeGoogleMaps(options: ScrapeOptions): Promise<Lead[]> {
  const { keyword, location, limit = 20, headless = true } = options;
  const searchQuery = `${keyword} di ${location}`;
  const startUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}?hl=id`;

  const leads: Lead[] = [];
  const visitedUrls = new Set<string>();

  log.info(`[Gmaps] Memulai pencarian: "${searchQuery}" (Target: ${limit} leads)`);

  const crawler = new PlaywrightCrawler({
    headless,
    maxRequestsPerCrawl: 50,
    launchContext: {
      launchOptions: {
        args: ['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'],
      },
    },
    // Anti-bot configuration
    browserPoolOptions: {
      useFingerprints: true,
    },
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 300,
    async requestHandler({ page, request }) {
      log.info(`[Gmaps] Membuka URL: ${request.url}`);

      // Handle cookie consent if visible
      try {
        const acceptBtn = page.locator('button:has-text("Terima semua"), button:has-text("Accept all"), form button[aria-label*="Accept"]').first();
        if (await acceptBtn.isVisible({ timeout: 3000 })) {
          await acceptBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch {
        // Ignore consent errors
      }

      // Wait for the feed container (search results panel)
      const feedSelector = 'div[role="feed"]';
      try {
        await page.waitForSelector(feedSelector, { timeout: 15000 });
      } catch {
        log.warning(`[Gmaps] Container hasil tidak ditemukan. Mengecek apakah langsung dialihkan ke 1 tempat spesifik...`);
      }

      // Scroll the feed to load more items
      let previousCount = 0;
      let scrollAttemptsWithoutNewItems = 0;
      const maxScrollAttempts = 25;

      for (let i = 0; i < maxScrollAttempts; i++) {
        const placeLinks = await page.$$('a[href*="/maps/place/"]');
        const currentCount = placeLinks.length;

        log.info(`[Gmaps] Ditemukan ${currentCount} tempat pada scroll ke-${i + 1}...`);

        if (currentCount >= limit || scrollAttemptsWithoutNewItems >= 4) {
          break;
        }

        if (currentCount === previousCount) {
          scrollAttemptsWithoutNewItems++;
        } else {
          scrollAttemptsWithoutNewItems = 0;
          previousCount = currentCount;
        }

        // Scroll inside the feed element with human-like jitter
        await page.evaluate((selector) => {
          const feed = document.querySelector(selector);
          if (feed) {
            feed.scrollTop += Math.floor(Math.random() * 400 + 600);
          }
        }, feedSelector);

        // Random jitter delay between 1.5 to 3 seconds
        const delay = Math.floor(Math.random() * 1500 + 1500);
        await page.waitForTimeout(delay);
      }

      // Collect all listing links
      const placeLinks = await page.$$('a[href*="/maps/place/"]');
      const hrefs: string[] = [];

      for (const link of placeLinks) {
        const href = await link.getAttribute('href');
        if (href && !visitedUrls.has(href)) {
          visitedUrls.add(href);
          hrefs.push(href);
          if (hrefs.length >= limit) break;
        }
      }

      log.info(`[Gmaps] Mengambil detail dari ${hrefs.length} listing...`);

      // Visit each place detail or extract from list view
      for (const [index, href] of hrefs.entries()) {
        try {
          await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(Math.floor(Math.random() * 1000 + 1500)); // anti-bot pause

          // Extract Business Name
          const name = await page.locator('h1.fontHeadlineLarge, h1').first().textContent().catch(() => null) || 'Tanpa Nama';
          const cleanName = name.trim();

          // Extract Rating & Reviews
          let ratingText = await page.locator('span.fontDisplayLarge, div.F7nice span[aria-hidden="true"]').first().textContent().catch(() => null);
          if (!ratingText) {
            const ariaLabelRating = await page.locator('span[aria-label*="bintang"], span[aria-label*="stars"]').first().getAttribute('aria-label').catch(() => null);
            if (ariaLabelRating) {
              const match = ariaLabelRating.match(/([0-9]+[.,][0-9]+)/);
              if (match) ratingText = match[1];
            }
          }
          const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

          const reviewsText = await page.locator('span[aria-label*="ulasan"], button[aria-label*="ulasan"]').first().textContent().catch(() => null);
          let reviewCount: number | undefined;
          if (reviewsText) {
            const match = reviewsText.replace(/\D/g, '');
            if (match) reviewCount = parseInt(match, 10);
          }

          // Extract Category
          const category = await page.locator('button.DkEaL, button[jsaction*="category"]').first().textContent().catch(() => null) || undefined;

          // Extract Address
          const addressBtn = page.locator('button[data-item-id*="address"]').first();
          const address = await addressBtn.getAttribute('aria-label').catch(() => null) || undefined;
          const cleanAddress = address ? address.replace(/^Alamat:\s*/i, '').trim() : undefined;

          // Extract Phone
          const phoneBtn = page.locator('button[data-item-id*="phone:tel:"]').first();
          let phone = await phoneBtn.getAttribute('aria-label').catch(() => null) || undefined;
          if (phone) {
            phone = phone.replace(/^Telepon:\s*/i, '').trim();
          }

          // Extract Website
          const websiteBtn = page.locator('a[data-item-id="authority"], a[aria-label*="Situs web"]').first();
          let website = await websiteBtn.getAttribute('href').catch(() => null) || undefined;
          if (website && website.startsWith('/url?q=')) {
            // Clean google redirect
            const urlObj = new URL('https://google.com' + website);
            website = urlObj.searchParams.get('q') || website;
          }

          const hasWebsite = Boolean(website && !website.includes('google.com') && !website.includes('business.site'));
          const { normalized: whatsappPhone, isMobileWhatsApp } = normalizeIndonesianPhone(phone);

          const lead: Lead = {
            id: crypto.randomUUID(),
            name: cleanName,
            category: category?.trim(),
            address: cleanAddress,
            phone: phone || undefined,
            whatsappPhone: whatsappPhone || undefined,
            hasWhatsApp: isMobileWhatsApp,
            website: website || undefined,
            hasWebsite,
            rating: isNaN(rating as number) ? undefined : rating,
            reviewCount,
            googleMapsUrl: href,
            source: 'gmaps',
            createdAt: new Date().toISOString(),
          };

          leads.push(lead);
          log.info(`[Gmaps] [${index + 1}/${hrefs.length}] Sukses: "${lead.name}" | WA: ${lead.whatsappPhone || '-'} | Web: ${hasWebsite ? 'Ada' : 'TIDAK ADA'}`);
        } catch (err) {
          log.warning(`[Gmaps] Gagal mengekstrak listing: ${href} (${err instanceof Error ? err.message : String(err)})`);
        }
      }
    },
  });

  await crawler.run([startUrl]);
  return leads;
}
