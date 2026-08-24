/**
 * Phone number normalization & WhatsApp helpers for Indonesian phone numbers
 */

export function normalizeIndonesianPhone(rawPhone?: string | null): {
  normalized: string | null;
  isMobileWhatsApp: boolean;
} {
  if (!rawPhone) {
    return { normalized: null, isMobileWhatsApp: false };
  }

  // Remove non-digit characters except leading +
  let cleaned = rawPhone.trim().replace(/[^0-9+]/g, '');

  // Handle +62
  if (cleaned.startsWith('+62')) {
    cleaned = '62' + cleaned.slice(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }

  // Indonesian cellular numbers typically start with 628... and are between 10 to 15 digits long
  const isMobileWhatsApp = /^628[1-9][0-9]{7,11}$/.test(cleaned);

  return {
    normalized: cleaned.length > 5 ? cleaned : null,
    isMobileWhatsApp,
  };
}

export function createWhatsAppUrl(phone: string, text?: string): string {
  const { normalized, isMobileWhatsApp } = normalizeIndonesianPhone(phone);
  if (!normalized) return '';
  
  const baseUrl = `https://wa.me/${normalized}`;
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`;
  }
  return baseUrl;
}
