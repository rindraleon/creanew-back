import slugifyLib from 'slugify';

/** "Canapé Moderne 3 Places" → "canape-moderne-3-places" */
export function slugify(value: string): string {
  return slugifyLib(value ?? '', {
    lower: true,
    strict: true,
    locale: 'fr',
    trim: true,
  });
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || `produit-${Date.now()}`;
  let candidate = root;
  let index = 1;
  // Protection contre les collisions infinies
  while (await exists(candidate)) {
    index += 1;
    candidate = `${root}-${index}`;
    if (index > 500) {
      candidate = `${root}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}

/** Génère une référence de commande lisible, ex. CMD-8F3K2A9C. */
export function generateOrderNumber(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 8; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  return `CMD-${yy}${suffix}`;
}

/** Génère un SKU lisible, ex. SKU-8F3K-2A9C. */
export function generateSku(name: string): string {
  const prefix = slugify(name).slice(0, 4).toUpperCase() || 'PRD';
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SKU-${prefix}-${random}`;
}
