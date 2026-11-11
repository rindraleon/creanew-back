// Mise à jour manuelle via une source fixe : un échec laisse le snapshot précédent intact.
import { createHash } from 'node:crypto';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = resolve(root, 'src/common/validators/disposable-domains.json');
const metaTarget = resolve(root, 'src/common/validators/disposable-domains.meta.json');
const api = 'https://api.github.com/repos/disposable-email-domains/disposable-email-domains/commits/main';
const options = { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'CreaNew-domain-list-updater' } };
const commitResponse = await fetch(api, options);
if (!commitResponse.ok) throw new Error(`Source indisponible : HTTP ${commitResponse.status}. Snapshot inchangé.`);
const { sha } = await commitResponse.json();
if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Révision distante invalide.');
const url = `https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/${sha}/disposable_email_blocklist.conf`;
const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`Liste indisponible : HTTP ${response.status}. Snapshot inchangé.`);
const text = await response.text();
if (text.length > 5_000_000) throw new Error('Liste anormalement volumineuse.');
const pattern = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const lines = text.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((line) => line && !line.startsWith('#'));
if (lines.some((line) => !pattern.test(line))) throw new Error('Entrée de domaine malformée. Snapshot inchangé.');
const domains = [...new Set(lines)].sort();
if (domains.length < 5000 || !domains.includes('yopmail.com') || !domains.includes('mailinator.com') || domains.includes('gmail.com')) {
  throw new Error('Liste inattendue : contrôle de cohérence échoué. Snapshot inchangé.');
}
const meta = { source: 'https://github.com/disposable-email-domains/disposable-email-domains', license: 'CC0-1.0', commit: sha,
  upstreamSha256: createHash('sha256').update(text).digest('hex'), retrievedAt: new Date().toISOString().slice(0, 10), domains: domains.length };
const tmp = `${target}.tmp`; const metaTmp = `${metaTarget}.tmp`;
try {
  await writeFile(tmp, `${JSON.stringify(domains)}\n`);
  await writeFile(metaTmp, `${JSON.stringify(meta, null, 2)}\n`);
  await rename(tmp, target); await rename(metaTmp, metaTarget);
  console.log(`Snapshot mis à jour : ${domains.length} domaines, révision ${sha}. Vérifiez le diff avant intégration.`);
} finally { await unlink(tmp).catch(() => {}); await unlink(metaTmp).catch(() => {}); }
