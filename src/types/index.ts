import { z } from 'zod';

export const LeadSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsappPhone: z.string().optional(),
  hasWhatsApp: z.boolean().default(false),
  website: z.string().optional(),
  hasWebsite: z.boolean().default(false),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  instagramUrl: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  source: z.enum(['gmaps', 'search_dork', 'instagram']),
  qualification: z.object({
    score: z.number().optional(),
    qualified: z.boolean().optional(),
    reasons: z.array(z.string()).optional(),
    suggestedService: z.string().optional(),
    outreachMessage: z.string().optional(),
  }).optional(),
  createdAt: z.string(),
});

export type Lead = z.infer<typeof LeadSchema>;

export interface ScrapeOptions {
  keyword: string;
  location: string;
  limit?: number;
  headless?: boolean;
}
