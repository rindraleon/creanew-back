import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { BusinessException } from './common/errors/business.exception';
import { ErrorCode } from './common/errors/error-codes';
import { StorageService } from './shared/storage/storage.service';
import { DataSource } from 'typeorm';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: false,
  });

  const config = app.get(ConfigService);

  /* ------------------------------- Sécurité -------------------------------- */

  // CSP volontairement permissif sur `style-src`/`img-src` : l'UI Swagger
  // charge ses propres assets et peut référencer des images distantes.
  // `object-src 'none'`, `frame-ancestors 'self'` et `base-uri 'self'`
  // restent en place : ce sont les protections qui comptent vraiment.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI injecte du JS inline
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          fontSrc: ["'self'", 'data:', 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  const origins = config.get<string[]>('security.corsOrigins') ?? ['http://localhost:5173'];
  app.enableCors({
    origin: (origin, callback) => {
      // Autorise les outils sans origine (curl, tests e2e) et la liste .env.
      if (!origin || origins.includes(origin) || origins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origine non autorisée par CORS : ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count'],
  });

  /* ------------------------------ Préfixe API ------------------------------ */

  const apiPrefix = config.get<string>('apiPrefix') ?? 'api';
  app.setGlobalPrefix(apiPrefix, { exclude: ['health', 'docs', 'docs-json'] });

  /* --------------------------- Validation globale --------------------------- */

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime les propriétés non décorées
      forbidNonWhitelisted: true, // 400 si propriété inconnue (anti mass-assignment)
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: true,
      exceptionFactory: (errors) => {
        const formatted = errors.reduce<Record<string, string[]>>((acc, error) => {
          const key = error.property;
          acc[key] = Object.values(error.constraints ?? {});
          return acc;
        }, {});
        return BusinessException.unprocessable(
          'Les données envoyées sont invalides.',
          ErrorCode.VALIDATION_ERROR,
          formatted,
        );
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  /* -------------------------------- Swagger -------------------------------- */

  if (config.get<boolean>('swagger.enabled') !== false) {
    const swaggerUser = config.get<string>('swagger.user');
    const swaggerPassword = config.get<string>('swagger.password');
    if (swaggerUser && swaggerPassword) {
      app.use(
        ['/docs', '/docs-json'],
        (
          req: { headers: Record<string, string | undefined> },
          res: {
            setHeader: (name: string, value: string) => void;
            status: (code: number) => { send: (body: string) => void };
          },
          next: () => void,
        ) => {
          const header = req.headers.authorization;
          if (!header || !header.startsWith('Basic ')) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
            res.status(401).send('Authentification requise');
            return;
          }
          const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
          const [user, password] = decoded.split(':');
          if (user !== swaggerUser || password !== swaggerPassword) {
            res.status(403).send('Accès refusé');
            return;
          }
          next();
        },
      );
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('MOBILIER-SHOP API')
      .setDescription(
        [
          'API REST de la marketplace multi-vendeurs **MOBILIER-SHOP**.',
          '',
          '## Authentification',
          "La plupart des endpoints exigent un JWT d'accès : cliquez sur **Authorize** et collez le token renvoyé par `POST /auth/login` (préfixe `Bearer` ajouté automatiquement).",
          '',
          '## Rôles',
          '- **customer** : catalogue, panier, commandes, profil',
          '- **seller** : boutique, produits, commandes (nécessite le statut `approved`)',
          '- **admin** : gestion complète de la plateforme',
          '',
          '## Règles métier importantes',
          "- Les montants sont des **entiers MGA** recalculés côté serveur : le frontend n'envoie jamais de prix.",
          '- Un vendeur doit être **approuvé** pour publier un produit.',
          "- Un paiement Mobile Money soumis reste **SUBMITTED** jusqu'à vérification manuelle par un administrateur.",
          "- `POST /orders` et `POST /payments/orders/{orderId}` acceptent l'en-tête **Idempotency-Key** contre les doubles soumissions.",
          '',
          '## Format des réponses',
          '- Pagination : `{ "items": [...], "meta": { page, limit, total, totalPages, hasNextPage, hasPreviousPage } }`',
          '- Erreur : `{ "statusCode", "message", "code", "errors"?, "timestamp", "path" }`',
        ].join('\n'),
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: "JWT d'accès (access token)",
          in: 'header',
        },
        'access-token',
      )
      .addTag('auth', 'Inscription, connexion, refresh, mot de passe')
      .addTag('users', 'Profil et adresses')
      .addTag('categories', 'Catalogue : catégories')
      .addTag('products', 'Catalogue : produits')
      .addTag('wishlist', 'Liste de souhaits (favoris)')
      .addTag('cart', 'Panier serveur')
      .addTag('orders', 'Commandes')
      .addTag('payments', 'Paiements Mobile Money')
      .addTag('sellers', 'Demandes et validation vendeur')
      .addTag('seller', 'Espace vendeur')
      .addTag('admin', 'Administration et statistiques')
      .addTag('notifications', 'Notifications')
      .addTag('files', 'Upload de fichiers (MinIO)')
      .addTag('health', 'État de santé')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'method',
        docExpansion: 'none',
      },
      customSiteTitle: 'MOBILIER-SHOP — Documentation API',
    });
  }

  /* ------------------------------ Démarrage -------------------------------- */

  const storage = app.get(StorageService);
  await storage.ensureBuckets().catch(() => undefined);

  await warnIfSchemaMissing(app);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  const nodeEnv = config.get<string>('nodeEnv') ?? 'development';
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `  MOBILIER-SHOP API      [${nodeEnv}]`,
      `  Écoute sur            http://localhost:${port}/${apiPrefix}`,
      `  Documentation         http://localhost:${port}/docs`,
      '',
    ].join('\n'),
  );
}

async function warnIfSchemaMissing(app: INestApplication): Promise<void> {
  try {
    const dataSource = app.get(DataSource, { strict: false });
    const rows = await dataSource.query<Array<{ present: boolean }>>(
      "SELECT to_regclass('public.users') IS NOT NULL AS present",
    );
    if (rows?.[0]?.present) return;

    new Logger('Database').error(
      [
        '',
        '  ⚠  Le schéma de base de données est absent : aucune table créée.',
        "     L'API démarrera mais toutes les requêtes échoueront en 500.",
        '',
        '     Corrigez-le avec :',
        '       npm run migration:run    (crée le schéma)',
        '       npm run seed             (jeu de données de démonstration)',
        '',
        '     ou, en une seule commande :  npm run db:setup',
        '',
      ].join('\n'),
    );
  } catch {
    /* Base injoignable : /health et les logs TypeORM le signalent déjà. */
  }
}

void bootstrap();
