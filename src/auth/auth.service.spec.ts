import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';

import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../shared/mail/mail.service';
import { QueueService } from '../shared/queue/queue.service';
import { RedisService } from '../shared/redis/redis.service';
import { ErrorCode } from '../common/errors/error-codes';
import { UserRole } from '../common/enums';
import type { User } from '../users/entities/user.entity';

const PASSWORD = 'Motdepasse1!';

const makeUser = async (overrides: Partial<User> = {}): Promise<User> =>
  ({
    id: 'user-1',
    email: 'client@example.local',
    firstName: 'Camille',
    lastName: 'Moreau',
    phone: null,
    role: UserRole.CUSTOMER,
    isActive: true,
    passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  const redisStore = new Map<string, number>();

  let refreshTokens: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    delete: jest.Mock;
  };
  let revokeQb: Record<string, jest.Mock>;

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const queue = { addEmail: jest.fn().mockResolvedValue(undefined) };
  const updateQb = {
    update: jest.fn(() => revokeQb),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.accessTtl': '15m',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshTtl': '30d',
        frontendUrl: 'http://localhost:5173',
        nodeEnv: 'test',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    revokeQb = {
      update: jest.fn(() => revokeQb),
      set: jest.fn(() => revokeQb),
      where: jest.fn(() => revokeQb),
      andWhere: jest.fn(() => revokeQb),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    // Faux Redis : compteur en mémoire, vidé avant chaque test pour qu'un
    // verrouillage ne contamine pas les tests suivants.
    redisStore.clear();
    redis = {
      get: jest.fn(async (key: string) =>
        redisStore.has(key) ? (redisStore.get(key) as number) : null,
      ),
      set: jest.fn(async (key: string, value: number) => {
        redisStore.set(key, value);
        return true;
      }),
      del: jest.fn(async (...keys: string[]) => {
        let supprimees = 0;
        for (const key of keys) {
          if (redisStore.delete(key)) supprimees += 1;
        }
        return supprimees;
      }),
    };

    refreshTokens = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (entity: unknown) => entity),
      create: jest.fn((dto: unknown) => ({ ...(dto as object), id: 'token-1' })),
      createQueryBuilder: jest.fn().mockReturnValue(revokeQb),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('access-token') } },
        { provide: ConfigService, useValue: config },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn(() => ({
              findOne: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({ affected: 1 }),
              save: jest.fn(),
              create: jest.fn((d: unknown) => d),
            })),
            createQueryBuilder: jest.fn().mockReturnValue(updateQb),
          },
        },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
        { provide: QueueService, useValue: queue },
        { provide: RedisService, useValue: redis },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: { save: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jest.clearAllMocks();
  });

  describe('connexion', () => {
    it('retourne des jetons si les identifiants sont valides', async () => {
      const user = await makeUser();
      usersService.findByEmail.mockResolvedValue(user);

      const result = await service.login({ email: user.email, password: PASSWORD });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toHaveLength(96); // 48 octets en hexadécimal
      expect(result.user.email).toBe(user.email);
    });

    it('refuse un mot de passe incorrect (401 INVALID_CREDENTIALS)', async () => {
      const user = await makeUser();
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'mauvais' })).rejects.toMatchObject(
        {
          status: HttpStatus.UNAUTHORIZED,
          code: ErrorCode.INVALID_CREDENTIALS,
        },
      );
    });

    it('message identique pour un email inconnu (pas d’énumération de comptes)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      let error: { message: string } | undefined;
      try {
        await service.login({ email: 'inconnu@example.local', password: PASSWORD });
      } catch (caught) {
        error = caught as { message: string };
      }
      expect(error?.message).toContain('Identifiants invalides.');
    });

    it('refuse un compte désactivé (403 ACCOUNT_DISABLED)', async () => {
      const user = await makeUser({ isActive: false });
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: PASSWORD })).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ACCOUNT_DISABLED,
      });
    });

    describe('verrouillage de compte', () => {
      const MAX = 5;

      beforeEach(() => {
        // Le seuil est lu dans l'environnement : on le fixe pour rendre le
        // test indépendant de la configuration de la machine.
        process.env.LOGIN_MAX_ATTEMPTS = String(MAX);
      });

      afterEach(() => {
        delete process.env.LOGIN_MAX_ATTEMPTS;
      });

      it(`refuse le bon mot de passe après ${MAX} échecs (429 TOO_MANY_REQUESTS)`, async () => {
        const user = await makeUser();
        usersService.findByEmail.mockResolvedValue(user);

        for (let tentative = 1; tentative <= MAX; tentative += 1) {
          await expect(
            service.login({ email: user.email, password: 'mauvais' }),
          ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        }

        // Le mot de passe est pourtant correct : le compte est verrouillé.
        await expect(
          service.login({ email: user.email, password: PASSWORD }),
        ).rejects.toMatchObject({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: ErrorCode.TOO_MANY_REQUESTS,
        });
      });

      it('remet le compteur à zéro après une connexion réussie', async () => {
        const user = await makeUser();
        usersService.findByEmail.mockResolvedValue(user);

        // Deux erreurs de frappe, puis une réussite : l'utilisateur légitime
        // ne doit pas rester sous la menace d'un verrouillage.
        for (let tentative = 1; tentative <= MAX - 3; tentative += 1) {
          await expect(
            service.login({ email: user.email, password: 'mauvais' }),
          ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        }

        const result = await service.login({ email: user.email, password: PASSWORD });
        expect(result.accessToken).toBe('access-token');

        for (let tentative = 1; tentative <= MAX - 3; tentative += 1) {
          await expect(
            service.login({ email: user.email, password: 'mauvais' }),
          ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        }
      });

      it('ne verrouille pas les autres comptes', async () => {
        const victime = await makeUser();
        const autre = await makeUser({ email: 'autre@example.local' });

        usersService.findByEmail.mockResolvedValue(victime);
        for (let tentative = 1; tentative <= MAX; tentative += 1) {
          await expect(
            service.login({ email: victime.email, password: 'mauvais' }),
          ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        }

        usersService.findByEmail.mockResolvedValue(autre);
        const result = await service.login({ email: autre.email, password: PASSWORD });
        expect(result.accessToken).toBe('access-token');
      });
    });
  });

  describe('refresh token', () => {
    it('refuse un refresh token inconnu', async () => {
      refreshTokens.findOne.mockResolvedValue(null);

      await expect(service.refresh('jeton-inconnu')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
    });

    it('refuse un refresh token expiré', async () => {
      refreshTokens.findOne.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.refresh('jeton-expire')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
    });

    it('réutilisation détectée → 401 REFRESH_TOKEN_REUSED et révocation de la famille', async () => {
      refreshTokens.findOne.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        revokedAt: new Date(), // déjà révoqué → réutilisation
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh('jeton-rejoue')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.REFRESH_TOKEN_REUSED,
      });

      // Toute la famille de jetons de l'utilisateur est révoquée.
      expect(revokeQb.execute).toHaveBeenCalled();
    });

    it('rotation : l’ancien jeton est révoqué après usage', async () => {
      const user = await makeUser();
      usersService.findById.mockResolvedValue(user);

      refreshTokens.findOne
        .mockResolvedValueOnce({
          id: 'token-1',
          userId: 'user-1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        })
        .mockResolvedValueOnce({ id: 'token-2', userId: 'user-1' });

      const result = await service.refresh('jeton-valide');

      expect(result.accessToken).toBe('access-token');
      expect(refreshTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('refresh sans jeton → 401', async () => {
      await expect(service.refresh('')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
    });
  });
});
