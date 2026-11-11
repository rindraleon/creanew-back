export const LEGAL_KEYS = ['legal_terms', 'privacy_policy'] as const;

/** Aucun texte juridique fictif n'est créé automatiquement. */
export function isPublishedLegalPolicy(value: unknown): value is {
  published: true;
  version: string;
  text: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return (
    policy.published === true &&
    typeof policy.version === 'string' &&
    policy.version.trim().length > 0 &&
    policy.version.length <= 80 &&
    typeof policy.text === 'string' &&
    policy.text.trim().length >= 20 &&
    policy.text.length <= 100000
  );
}
