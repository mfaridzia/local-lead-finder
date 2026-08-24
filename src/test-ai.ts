import dotenv from 'dotenv';
import { qualifyLeadWithDeepSeek } from './ai/qualifier.js';
import { Lead } from './types/index.js';

dotenv.config();

async function main() {
  console.log('🔍 Menguji koneksi DeepSeek API...');
  console.log('API Key terdeteksi:', process.env.DEEPSEEK_API_KEY ? `sk-...${process.env.DEEPSEEK_API_KEY.slice(-6)}` : 'TIDAK DITEMUKAN');

  const sampleLead: Lead = {
    id: 'test-1',
    name: 'Melissa Bakery',
    category: 'Bakery & Toko Roti',
    address: 'Mataram, Lombok',
    phone: '0877-6503-3335',
    whatsappPhone: '6287765033335',
    hasWhatsApp: true,
    website: undefined,
    hasWebsite: false,
    rating: 4.6,
    reviewCount: 1344,
    source: 'gmaps',
    createdAt: new Date().toISOString(),
  };

  console.log('\n📊 Data Lead yang Dikirim:');
  console.log(JSON.stringify(sampleLead, null, 2));

  console.log('\n⏳ Menghubungi DeepSeek API (model: deepseek-chat)...');
  const result = await qualifyLeadWithDeepSeek(sampleLead);

  console.log('\n✅ HASIL ANALISIS DEEPSEEK AI:');
  console.log('----------------------------------------------------');
  console.log(`🎯 Qualified : ${result.qualified ? 'YA (Potensial)' : 'TIDAK'}`);
  console.log(`🔥 Score     : ${result.score} / 100`);
  console.log(`🛠️ Layanan   : ${result.suggestedService}`);
  console.log(`📌 Alasan    :`);
  result.reasons.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));
  console.log(`\n💬 Draft WhatsApp Outreach Message:`);
  console.log(`"${result.outreachMessage}"`);
  console.log('----------------------------------------------------');
}

main().catch(console.error);
