import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../common/enums';

/**
 * Seed d'installation — et rien d'autre.
 *
 * Conformément au cahier des charges, ce seed ne crée **que le compte
 * administrateur** indispensable pour installer et prendre en main
 * l'application. Aucune donnée métier (produits, catégories, vendeurs,
 * clients, commandes) n'est générée : tout est créé par l'application
 * elle-même, via les CRUD réels.
 *
 * Le seed est idempotent et **non destructeur** : il ne vide aucune table,
 * il se contente de créer l'administrateur s'il n'existe pas encore. On peut
 * donc l'exécuter sur une base qui contient déjà de vraies données.
 */
export async function runSeed(dataSource: DataSource): Promise<AdminSeedResult> {
  const users = dataSource.getRepository(User);

  const email = (process.env.ADMIN_EMAIL ?? 'admin@example.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Motdepasse1!';

  const existing = await users.findOne({ where: { email } });
  if (existing) {
    return { email, created: false, role: existing.role };
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = users.create({
    email,
    passwordHash,
    firstName: 'Admin',
    lastName: 'Système',
    phone: null,
    role: UserRole.ADMIN,
  });
  await users.save(admin);

  return { email, created: true, role: UserRole.ADMIN };
}

export interface AdminSeedResult {
  email: string;
  created: boolean;
  role: UserRole;
}
