// Render API : déploiement du commit testé uniquement, puis attente de l'état live.
// Aucun secret ni corps de réponse fournisseur n'est écrit dans les journaux.
import { pathToFileURL } from 'node:url';

const progress = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const failed = new Set(['deactivated', 'build_failed', 'pre_deploy_failed', 'update_failed', 'canceled']);

function required(value, label) {
  if (!value) throw new Error(`${label} est requis avant tout déploiement.`);
  return value;
}

function origin(value, label) {
  let url;
  try { url = new URL(required(value, label)); } catch { throw new Error(`${label} doit être une origine HTTPS valide.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${label} doit être une origine HTTPS sans chemin, identifiant ou paramètre.`);
  }
}

async function call(fetcher, url, options, context) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error(`${context} : erreur réseau ou délai dépassé ; vérifier le fournisseur avant de réessayer.`); }
  return response;
}

async function objectResponse(response, context) {
  if (!response.ok) throw new Error(`${context} : HTTP ${response.status}.`);
  try { return await response.json(); } catch { throw new Error(`${context} : réponse JSON invalide.`); }
}

export async function deploy({ env = process.env, fetcher = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, log = console.log } = {}) {
  const apiKey = required(env.RENDER_API_KEY, 'RENDER_API_KEY');
  const serviceId = required(env.RENDER_SERVICE_ID, 'RENDER_SERVICE_ID');
  const sha = required(env.RENDER_COMMIT_SHA, 'RENDER_COMMIT_SHA').toLowerCase();
  const repository = required(env.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  const token = required(env.GH_TOKEN, 'GH_TOKEN');
  const kind = required(env.RENDER_SERVICE_KIND, 'RENDER_SERVICE_KIND');
  if (!/^srv-[a-z0-9]+$/.test(serviceId) || !/^[a-f0-9]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('Identifiant Render, SHA Git ou dépôt GitHub invalide.');
  }
  if (kind !== 'backend' && kind !== 'frontend') throw new Error('Type de service Render invalide.');
  origin(kind === 'backend' ? env.BACKEND_URL : env.FRONTEND_URL, kind === 'backend' ? 'BACKEND_URL' : 'FRONTEND_URL');
  if (kind === 'frontend' && env.VITE_API_URL !== '/api') {
    throw new Error('Le déploiement frontend exige VITE_API_URL=/api et un proxy même origine.');
  }

  const root = `https://api.render.com/v1/services/${serviceId}`;
  const headers = { authorization: `Bearer ${apiKey}`, accept: 'application/json' };
  const service = await objectResponse(await call(fetcher, root, { headers }, 'Lecture du service Render'), 'Lecture du service Render');
  let linkedRepo;
  try {
    const parsed = new URL(service.repo);
    if (parsed.hostname !== 'github.com' || parsed.protocol !== 'https:') throw new Error('invalid');
    linkedRepo = parsed.pathname.replace(/^\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();
  } catch { throw new Error('Le service Render doit être lié au dépôt GitHub du workflow.'); }
  if (linkedRepo !== repository.toLowerCase() || service.branch !== 'master') {
    throw new Error('Dépôt ou branche Render différent de ce workflow (master requis).');
  }
  if (service.type !== 'web_service' || (service.serviceDetails?.runtime ?? service.serviceDetails?.env) !== 'docker') {
    throw new Error('Le service Render doit être un web service construit depuis Docker.');
  }
  const autoDeploy = service.autoDeployTrigger ?? (service.autoDeploy === 'no' ? 'off' : 'unknown');
  if (autoDeploy !== 'off') throw new Error('Désactiver Auto-Deploy dans Render avant le CD GitHub.');
  if (service.suspended !== 'not_suspended') throw new Error('Le service Render est suspendu ou son état est inconnu.');
  if (kind === 'backend' && service.serviceDetails?.envSpecificDetails?.preDeployCommand?.trim() !== 'npm run migration:run:prod') {
    throw new Error('Configurer exactement la Pre-Deploy Command Render : npm run migration:run:prod.');
  }

  // Ne jamais lancer un second déploiement alors qu'un autre est en cours,
  // notamment après un timeout ou une réponse 202 ambiguë.
  const listUrl = new URL(`${root}/deploys`);
  listUrl.searchParams.set('limit', '100');
  for (const status of progress) listUrl.searchParams.append('status', status);
  const active = await objectResponse(await call(fetcher, listUrl, { headers }, 'Contrôle des déploiements en cours'), 'Contrôle des déploiements en cours');
  if (!Array.isArray(active) || active.some((item) => !item?.deploy || !progress.has(item.deploy.status))) {
    throw new Error('Réponse Render inattendue pour les déploiements en cours.');
  }
  if (active.length) throw new Error('Un déploiement Render est déjà en cours ; attendre et contrôler son résultat.');

  // Empêche notamment un ancien workflow, terminé en retard, de rétablir un ancien commit.
  const githubUrl = `https://api.github.com/repos/${repository}/commits/master`;
  const githubHeaders = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  const head = await objectResponse(await call(fetcher, githubUrl, { headers: githubHeaders }, 'Contrôle du commit GitHub'), 'Contrôle du commit GitHub');
  if (head.sha?.toLowerCase() !== sha) throw new Error('Ce commit testé n’est plus le HEAD de master : déploiement refusé.');

  const response = await call(fetcher, `${root}/deploys`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ commitId: sha }),
  }, 'Déclenchement Render');
  if (response.status === 202) {
    throw new Error('Render a répondu 202 sans identifiant exploitable : vérifier manuellement la file avant toute nouvelle tentative.');
  }
  if (response.status !== 201) throw new Error(`Déclenchement Render : HTTP ${response.status}. Vérifier le service avant de réessayer.`);
  const created = await objectResponse(response, 'Déclenchement Render');
  if (!/^[a-zA-Z0-9_-]+$/.test(created.id ?? '')) throw new Error('Render n’a pas fourni d’identifiant de déploiement ; vérifier manuellement.');
  if (created.commit?.id && created.commit.id.toLowerCase() !== sha) throw new Error('Le commit Render ne correspond pas au commit testé.');
  log(`Render : déploiement ${created.id}, commit ${sha}.`);

  const deadline = now() + 20 * 60_000;
  let previous = '';
  while (now() < deadline) {
    const current = await objectResponse(await call(fetcher, `${root}/deploys/${created.id}`, { headers }, 'Suivi Render'), 'Suivi Render');
    if (current.status !== previous) { log(`Render : état ${String(current.status)}.`); previous = current.status; }
    if (current.status === 'live') {
      if (current.commit?.id?.toLowerCase() !== sha) throw new Error('Commit du déploiement live introuvable ou différent du commit testé.');
      return { id: created.id, sha };
    }
    if (failed.has(current.status)) throw new Error(`Déploiement Render en échec : ${current.status}.`);
    if (!progress.has(current.status)) throw new Error('État Render inconnu : vérifier manuellement le déploiement.');
    await sleep(15_000);
  }
  throw new Error('Délai Render dépassé : le déploiement peut encore être actif ; vérifier avant de réessayer.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch((error) => { console.error(error instanceof Error ? error.message : 'Échec Render.'); process.exitCode = 1; });
}
