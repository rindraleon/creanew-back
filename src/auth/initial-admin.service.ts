import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity, UserRole } from '../common/enums';
import { assertValidEmail } from '../common/validators/email-disposable.validator';
import { User } from '../users/entities/user.entity';

/** Création unique, au démarrage, depuis les seules variables privées du serveur. */
@Injectable()
export class InitialAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitialAdminService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      // Même verrou que l'ancien parcours pour sérialiser aussi un déploiement progressif.
      await manager.query('SELECT pg_advisory_xact_lock(4201973)');

      // Vérifier les tables utilisées avant de les interroger : une migration manquante
      // doit arrêter le démarrage avec une consigne, sans créer le marqueur à la volée.
      const [schema] = await manager.query<
        Array<{ users: boolean; auditLogs: boolean; initialAdminState: boolean }>
      >(`
        SELECT to_regclass('users') IS NOT NULL AS "users",
               to_regclass('audit_logs') IS NOT NULL AS "auditLogs",
               to_regclass('initial_admin_state') IS NOT NULL AS "initialAdminState"
      `);
      const missingTables = [
        !schema.users && 'users',
        !schema.auditLogs && 'audit_logs',
        !schema.initialAdminState && 'initial_admin_state',
      ].filter((table): table is string => Boolean(table));
      if (missingTables.length > 0) {
        throw new Error(
          `Schéma PostgreSQL incomplet (tables absentes : ${missingTables.join(', ')}). ` +
            'Vérifiez la base configurée, puis exécutez "npm run migration:run" depuis le dossier backend ' +
            '(ou "npm run migration:run:prod" après compilation en production) et redémarrez l’API.',
        );
      }

      const [state] = await manager.query<
        Array<{
          hasAdmin: boolean;
          hasAdminHistory: boolean;
          hasUsers: boolean;
          initialized: boolean;
        }>
      >(`
        SELECT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin') AS "hasAdmin",
               EXISTS (
                 SELECT 1 FROM "audit_logs"
                 WHERE ("action" = 'USER_REGISTERED' AND (
                   "metadata"->>'bootstrap' = 'true' OR "metadata"->>'initialAdmin' = 'environment'
                 ))
                    OR ("action" = 'USER_ROLE_CHANGED' AND "metadata"->>'role' = 'admin')
               ) AS "hasAdminHistory",
               EXISTS (SELECT 1 FROM "users") AS "hasUsers",
               EXISTS (SELECT 1 FROM "initial_admin_state") AS "initialized"
      `);
      if (!state.initialized && (state.hasAdmin || state.hasAdminHistory)) {
        await manager.query(
          'INSERT INTO "initial_admin_state" ("singleton") VALUES (true) ON CONFLICT DO NOTHING',
        );
        return { kind: 'existing' } as const;
      }
      if (state.initialized) return { kind: 'existing' } as const;

      const suppliedEmail = this.config.get<string>('INITIAL_ADMIN_EMAIL')?.trim() ?? '';
      const username = (this.config.get<string>('INITIAL_ADMIN_USERNAME') ?? '')
        .trim()
        .toLowerCase();
      // Un mot de passe n'est jamais normalisé, imprimé ni inclus dans l'audit.
      const password = this.config.get<string>('INITIAL_ADMIN_PASSWORD') ?? '';
      if (!suppliedEmail && !username && !password) {
        return { kind: state.hasUsers ? 'recovery-needed' : 'unconfigured' } as const;
      }
      // Une base non vierge sans historique d'admin ne permet pas de prouver que
      // le dernier admin n'a jamais été supprimé : reprise manuelle de confiance.
      if (state.hasUsers) {
        throw new Error(
          'Initialisation automatique refusée : base non vierge sans historique administrateur. Utiliser une procédure de restauration sécurisée.',
        );
      }
      if (!suppliedEmail || !username || !password) {
        throw new Error(
          'Pour initialiser le premier admin, définir INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_USERNAME et INITIAL_ADMIN_PASSWORD ensemble.',
        );
      }
      const email = assertValidEmail(suppliedEmail);
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        throw new Error('INITIAL_ADMIN_USERNAME doit contenir 3 à 30 lettres, chiffres ou ._-');
      }
      if (
        password.length < 12 ||
        password.length > 128 ||
        !/[A-Za-z]/.test(password) ||
        !/\d/.test(password)
      ) {
        throw new Error(
          'INITIAL_ADMIN_PASSWORD doit contenir 12 à 128 caractères, au moins une lettre et un chiffre.',
        );
      }
      const firstName = this.config.get<string>('INITIAL_ADMIN_FIRST_NAME')?.trim() || null;
      const lastName = this.config.get<string>('INITIAL_ADMIN_LAST_NAME')?.trim() || username;
      if ((firstName?.length ?? 0) > 120 || lastName.length > 120) {
        throw new Error('Les noms du premier administrateur sont limités à 120 caractères.');
      }

      const repo = manager.getRepository(User);
      // Même un compte archivé ne doit pas être promu ou remplacé silencieusement.
      if (await repo.findOne({ where: [{ email }, { username }], withDeleted: true })) {
        throw new Error(
          'Impossible d’initialiser l’admin : l’adresse ou le nom d’utilisateur appartient déjà à un compte.',
        );
      }
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      const user = await repo.save(
        repo.create({
          email,
          username,
          passwordHash,
          firstName,
          lastName,
          role: UserRole.ADMIN,
          isActive: true,
          // Donnée historique conservée, sans effet sur l'authentification.
          isEmailVerified: false,
        }),
      );
      await manager.query('INSERT INTO "initial_admin_state" ("singleton") VALUES (true)');
      return { kind: 'created', id: user.id } as const;
    });

    if (result.kind === 'created') {
      await this.audit.log({
        userId: result.id,
        action: AuditAction.USER_REGISTERED,
        entity: AuditEntity.USER,
        entityId: result.id,
        metadata: { initialAdmin: 'environment' },
      });
      this.logger.log('Premier administrateur créé depuis les variables du serveur.');
    } else if (result.kind === 'recovery-needed') {
      this.logger.warn(
        'Base non vierge sans administrateur connu : restauration sécurisée nécessaire.',
      );
    } else if (result.kind === 'unconfigured') {
      this.logger.warn(
        'Aucun administrateur initialisé : variables INITIAL_ADMIN_* non renseignées.',
      );
    }
  }
}
