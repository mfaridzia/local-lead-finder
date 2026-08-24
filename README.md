# 🎯 Local Lead Finder & AI Outreach

An automated lead discovery and qualification engine for local businesses using **Crawlee** + **Playwright** and **DeepSeek AI** (with Zod schema validation). Includes a modern, fully-responsive Web Dashboard with 1-click WhatsApp outreach.

---

## 🚀 Key Features

- **Google Maps Scraper:** Extracts business names, categories, ratings, review counts, addresses, phone numbers, and detects whether the business has an active website or not.
- **Indonesian Phone & WhatsApp Normalizer:** Automatically formats local cellular numbers (`08...` / `+62...`) to international standard (`628...`) and generates direct WhatsApp click-to-chat links with personalized icebreaker messages.
- **DeepSeek AI Lead Qualification:** Analyzes prospects, computes a lead readiness score (0–100), identifies digital gaps (e.g., *"1,000+ reviews but no online catalog"*), and generates polite, non-spammy WhatsApp outreach messages.
- **Anti-Bot & Stealth Engine:** Built on top of Crawlee fingerprint spoofing, SSL handling, and randomized human scrolling jitter to avoid CAPTCHAs and bot detection.
- **Interactive Responsive Dashboard:** Dual-view UI (rich data table for desktop and responsive cards for mobile/tablet) with live filtering, instant search, and web-based scraping trigger.
- **Auto Export:** Automatically exports all scraped and qualified leads into `.json` and spreadsheet-ready `.csv` files inside the `output/` directory.

---

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Install Playwright Chromium browser
npx playwright install chromium
```

---

## ⚙️ Configuration (DeepSeek AI)

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Add your DeepSeek API key in `.env`:
   ```env
   DEEPSEEK_API_KEY=sk-...
   PORT=3000
   ```
> **Note:** If `DEEPSEEK_API_KEY` is not provided, the application automatically uses smart heuristic scoring as a fallback so the dashboard and scraper continue to work smoothly.

---

## 💻 Usage

### 1. Launch the Interactive Web Dashboard (Recommended)
```bash
pnpm dashboard
```
Open your browser at **`http://localhost:3000`** to:
- Browse leads with one-click filters (*"❌ No Website"*, *"💬 Has WhatsApp"*, *"🔥 Score > 80"*).
- View AI-generated gap analyses and value proposition recommendations.
- Click **"Outreach"** to preview, edit, and launch 1-click WhatsApp conversations with prospects.
- Trigger new scraping tasks directly from the UI.

---

### 2. Run Scraping via Terminal (CLI)
```bash
# Example: Find bakeries in Mataram (max 15 leads)
pnpm scrape:gmaps -k "bakery" -l "Mataram" -m 15

# Other niche examples:
pnpm scrape:gmaps -k "catering" -l "Mataram" -m 20
pnpm scrape:gmaps -k "barbershop" -l "Denpasar" -m 10
pnpm scrape:gmaps -k "laundry" -l "Surabaya" -m 25

# Visual mode (opens browser window):
pnpm scrape:gmaps -k "bakery" -l "Mataram" -m 10 --no-headless
```

---

## 📊 Output Format

Scraped leads are automatically saved in the `output/` folder:
- `output/gmaps-<keyword>-<location>-<timestamp>.csv` (Ready for Excel / Google Sheets)
- `output/gmaps-<keyword>-<location>-<timestamp>.json`

### CSV Columns:
1. `Business Name`
2. `Category`
3. `Phone Number`
4. `WhatsApp`
5. `Has Website?` (*Yes / NO*)
6. `Rating` & `Review Count`
7. `AI Lead Score`
8. `Address`
9. `Direct WhatsApp Link`
10. `Source Link`

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (ESM) + TypeScript
- **Web Scraping:** Crawlee + Playwright
- **AI Engine:** DeepSeek Chat API (`deepseek-chat`)
- **Schema Validation:** Zod
- **Backend Server:** Hono + `@hono/node-server`
- **Frontend Dashboard:** HTML5 + Tailwind CSS + Vanilla JS

---

## 📄 License

ISC License
