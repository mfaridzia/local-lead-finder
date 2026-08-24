# 🎯 Local Lead Finder

Tool otomatis pencari lead bisnis lokal dari **Google Maps** dan **Search Engine** berbasis **Crawlee** + **Playwright** (100% gratis, aman dari bot detection dengan rotasi fingerprint & human-like delay).

---

## 🚀 Fitur Utama

- **Google Maps Scraper:** Mengambil nama bisnis, rating, jumlah ulasan, alamat, nomor telepon, dan mendeteksi apakah bisnis sudah memiliki website atau belum.
- **Normalisasi WhatsApp Indonesia:** Otomatis mengubah format nomor seluler (`08...` / `+62...`) menjadi `628...` dan langsung membuat link chat WhatsApp dengan template pesan (*icebreaker*).
- **Anti-Bot & Stealth:** Menggunakan Crawlee fingerprint spoofing, SSL handling, dan jeda scrolling acak (human jitter) agar tidak terblokir / bebas captcha.
- **Auto Export:** Menyimpan hasil pencarian ke file `.json` dan spreadsheet `.csv` di folder `output/`.

---

## 📦 Instalasi

Dependencies sudah terpasang. Jika ingin install ulang:

```bash
pnpm install
npx playwright install chromium
```

---

## 💻 Cara Menjalankan

### 1. Buka Web Dashboard Interaktif (Rekomendasi)
```bash
pnpm dashboard
```
Buka browser di **`http://localhost:3000`** untuk:
- Melihat tabel leads dengan filter (Score AI > 80, Tanpa Website, WhatsApp Ready).
- Melihat ringkasan analisis gap & peluang bisnis oleh AI.
- Klik **"Outreach"** untuk edit & kirim template pesan personal langsung ke WhatsApp prospek (1-klik).
- Menjalankan scraping baru langsung dari antarmuka web.

---

### 2. Jalankan Scraping via Terminal / CLI
```bash
# Contoh: Cari bakery di Mataram
pnpm scrape:gmaps -k "bakery" -l "Mataram" -m 15

# Contoh niche lain:
pnpm scrape:gmaps -k "katering" -l "Mataram" -m 20
pnpm scrape:gmaps -k "barbershop" -l "Denpasar" -m 10
pnpm scrape:gmaps -k "laundry" -l "Surabaya" -m 25

# Mode Non-Headless (untuk melihat browser bekerja secara visual):
pnpm scrape:gmaps -k "toko kue" -l "Mataram" -m 10 --no-headless
```

---

## 🤖 Konfigurasi DeepSeek AI

1. Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Masukkan API key DeepSeek Anda di `.env`:
   ```env
   DEEPSEEK_API_KEY=sk-...
   ```
*(Catatan: Jika API key belum diisi, sistem otomatis menggunakan smart fallback heuristic scoring sehingga dashboard tetap bisa berjalan normal).*

---

## 📊 Format Output

Setiap kali dijalankan, hasil otomatis tersimpan di folder `output/`:
- `output/gmaps-<keyword>-<lokasi>-<timestamp>.csv` (Bisa langsung dibuka di Excel / Google Sheets)
- `output/gmaps-<keyword>-<lokasi>-<timestamp>.json`

Kolom CSV mencakup:
1. `Nama Bisnis`
2. `Kategori`
3. `No Telepon`
4. `WhatsApp`
5. `Punya Website?` (*Ya / TIDAK*)
6. `Rating` & `Jumlah Review`
7. `Alamat`
8. `Link WA Direct` (*Tinggal klik untuk langsung chat prospek*)
9. `Link Google Maps`
