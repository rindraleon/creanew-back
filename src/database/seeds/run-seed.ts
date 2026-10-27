import { AppDataSource } from '../data-source';
import { runSeed } from './initial.seed';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const result = await runSeed(AppDataSource);

    // eslint-disable-next-line no-console
    console.log('\n  Seed d’installation terminé.\n');
    if (result.created) {
      // eslint-disable-next-line no-console
      console.log(`  Administrateur créé : ${result.email}`);
      if (!process.env.ADMIN_PASSWORD) {
        // eslint-disable-next-line no-console
        console.log(
          '  Mot de passe par défaut utilisé (variable ADMIN_PASSWORD absente).' +
            ' Changez-le après la première connexion.',
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(`  Administrateur déjà présent : ${result.email} (rien à faire).`);
    }
    // eslint-disable-next-line no-console
    console.log(
      '\n  Aucune donnée métier n’est seedée : produits, catégories, vendeurs et\n' +
        '  clients se créent depuis l’application (CRUD réels).\n',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Seed échoué :', error);
  process.exit(1);
});
