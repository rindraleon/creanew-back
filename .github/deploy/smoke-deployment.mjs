// Vérification non destructive après déploiement. Aucun compte ni donnée de test.
const value = process.env.BACKEND_URL;
if (!value) throw new Error('BACKEND_URL est requis (origine HTTPS publique du backend).');
const base = new URL(value);
if ((base.protocol !== 'https:' && process.env.ALLOW_HTTP_SMOKE !== 'true') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
  throw new Error('BACKEND_URL doit être une origine HTTPS sans identifiant.');
}
const prefix = (process.env.API_PREFIX || 'api').replace(/^\/+|\/+$/g, '');
async function json(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Contrôle ${path} : HTTP ${response.status}`);
  return response.json();
}
const health = await json('/health');
if (health.status !== 'ok' || health.services?.database !== 'up') throw new Error('Santé backend ou base dégradée.');
const providers = await json(`/${prefix ? `${prefix}/` : ''}auth/oauth/providers`);
if (typeof providers.google !== 'boolean' || typeof providers.facebook !== 'boolean') throw new Error('Configuration auth inattendue.');
console.log('Santé backend, base de données et endpoint auth : OK.');
