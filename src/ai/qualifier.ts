import { z } from 'zod';
import dotenv from 'dotenv';
import { Lead } from '../types/index.js';

dotenv.config();

export const AIQualificationSchema = z.object({
  qualified: z.boolean(),
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  suggestedService: z.string(),
  outreachMessage: z.string(),
});

export type AIQualification = z.infer<typeof AIQualificationSchema>;

/**
 * Qualify lead and generate personalized WhatsApp outreach using DeepSeek API + Zod
 */
export async function qualifyLeadWithDeepSeek(lead: Lead, apiKey?: string): Promise<AIQualification> {
  const deepseekApiKey = apiKey || process.env.DEEPSEEK_API_KEY;

  if (!deepseekApiKey || deepseekApiKey === 'your_deepseek_api_key_here') {
    // Fallback heuristic scoring if no API key is provided
    return generateFallbackQualification(lead);
  }

  const systemPrompt = `
You are an expert B2B sales development representative specializing in digital solutions (websites, online catalogs, WhatsApp order systems) for Indonesian MSMEs (UMKM) and local businesses.

Your task is to analyze a local business prospect, score its qualification (0-100), identify gaps, and write a polite, non-spammy, highly-personalized WhatsApp outreach message in natural Indonesian.

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON matching this schema:
{
  "qualified": boolean,
  "score": number (0 to 100),
  "reasons": string[] (list of 2-3 key findings why this lead is good or not),
  "suggestedService": string (e.g. "Website Katalog Instan + WhatsApp Order", "Landing Page Company Profile"),
  "outreachMessage": string (polite Indonesian WhatsApp icebreaker, max 3-4 sentences, friendly, no hard-selling)
}

RULES FOR OUTREACH MESSAGE:
1. Mention the specific business name and highlight their positive reputation (e.g., their Google reviews).
2. Point out a gentle opportunity (e.g., noticed they don't have a direct online catalog/website yet).
3. Offer to share a free demo/prototype created specifically for their business.
4. Keep it friendly, casual-professional ("Halo kak/Pak/Bu [Nama Bisnis]...").
Do NOT include markdown formatting or explanations outside the JSON.
`.trim();

  const userPrompt = `
Analyze this local business lead:
- Business Name: ${lead.name}
- Category: ${lead.category || 'Bisnis Lokal'}
- Location: ${lead.address || 'Indonesia'}
- Rating: ${lead.rating ? `${lead.rating} stars` : 'Belum ada'}
- Review Count: ${lead.reviewCount || 0} reviews
- Has Website: ${lead.hasWebsite ? `Yes (${lead.website})` : 'NO WEBSITE'}
- Has Mobile WhatsApp: ${lead.hasWhatsApp ? 'YES' : 'No'}
- Source: ${lead.source}
`.trim();

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: {
          type: 'json_object',
        },
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawJson = data.choices[0]?.message?.content;
    if (!rawJson) {
      throw new Error('Empty response from DeepSeek API');
    }

    const parsedJson = JSON.parse(rawJson);
    const validated = AIQualificationSchema.parse(parsedJson);
    return validated;
  } catch (error) {
    console.warn(`[AI Qualifier] Error calling DeepSeek API for "${lead.name}":`, error instanceof Error ? error.message : error);
    return generateFallbackQualification(lead);
  }
}

/**
 * Fallback scoring heuristic if DeepSeek API key is not yet set
 */
function generateFallbackQualification(lead: Lead): AIQualification {
  let score = 50;
  const reasons: string[] = [];

  if (!lead.hasWebsite) {
    score += 25;
    reasons.push('Belum memiliki website resmi');
  } else {
    score -= 10;
    reasons.push('Sudah memiliki website');
  }

  if (lead.hasWhatsApp) {
    score += 15;
    reasons.push('Nomor WhatsApp seluler terdeteksi aktif');
  }

  if (lead.reviewCount && lead.reviewCount > 100) {
    score += 10;
    reasons.push(`Memiliki basis pelanggan aktif (${lead.reviewCount} ulasan)`);
  }

  score = Math.min(Math.max(score, 0), 100);
  const qualified = score >= 70;

  const suggestedService = lead.hasWebsite
    ? 'Redesign Website & Automasi Order WhatsApp'
    : 'Website Katalog Instan + WhatsApp Order System';

  const outreachMessage = `Halo kak ${lead.name}, salam kenal! Saya perhatikan profil usahanya di ${lead.address || 'Google Maps'} memiliki review yang sangat bagus (${lead.reviewCount || 0} ulasan). Namun saya lihat belum ada website/katalog online resminya. Kebetulan saya sedang membuat prototype katalog instan yang terhubung langsung ke WhatsApp agar customer bisa pilih produk lebih rapi. Boleh saya kirimkan link demonya untuk dilihat?`;

  return {
    qualified,
    score,
    reasons,
    suggestedService,
    outreachMessage,
  };
}

/**
 * Qualifies a batch of leads sequentially with a small delay
 */
export async function qualifyBatch(leads: Lead[], apiKey?: string): Promise<Lead[]> {
  const results: Lead[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const qualification = await qualifyLeadWithDeepSeek(lead, apiKey);
    results.push({
      ...lead,
      qualification,
    });
    // Brief delay to be polite on API rate limits
    if (i < leads.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}
