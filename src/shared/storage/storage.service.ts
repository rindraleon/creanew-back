import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as Minio from 'minio';
import { StorageBucket } from '../../common/enums';
import { BusinessException } from '../../common/errors/business.exception';
import { ErrorCode } from '../../common/errors/error-codes';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredObject {
  bucket: StorageBucket;
  objectKey: string;
  url: string;
  mimeType: string;
  size: number;
  originalName: string;
}

/** Whitelist MIME → extension. Le client ne choisit jamais le chemin ni l'extension. */
const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const DOCUMENT_MIME: Record<string, string> = {
  ...IMAGE_MIME,
  'application/pdf': 'pdf',
};

const BUCKET_POLICY: Record<StorageBucket, { mime: Record<string, string>; maxSize: number }> = {
  [StorageBucket.PRODUCTS]: { mime: IMAGE_MIME, maxSize: 5 * 1024 * 1024 },
  [StorageBucket.AVATARS]: { mime: IMAGE_MIME, maxSize: 2 * 1024 * 1024 },
  [StorageBucket.SELLER_DOCUMENTS]: { mime: DOCUMENT_MIME, maxSize: 10 * 1024 * 1024 },
  [StorageBucket.PAYMENT_PROOFS]: { mime: DOCUMENT_MIME, maxSize: 5 * 1024 * 1024 },
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('storage.accessKey') && this.config.get<string>('storage.secretKey'),
    );
  }

  private getClient(): Minio.Client {
    if (!this.isConfigured) {
      throw new BusinessException(
        "Le stockage de fichiers n'est pas configuré sur ce serveur.",
        500,
        { code: ErrorCode.INTERNAL_ERROR },
      );
    }
    if (!this.client) {
      this.client = new Minio.Client({
        endPoint: this.config.get<string>('storage.endpoint') ?? 'localhost',
        port: this.config.get<number>('storage.port') ?? 9000,
        useSSL: this.config.get<boolean>('storage.useSSL') ?? false,
        accessKey: this.config.get<string>('storage.accessKey') ?? '',
        secretKey: this.config.get<string>('storage.secretKey') ?? '',
        region: this.config.get<string>('storage.region') ?? 'mg-central-1',
      });
    }
    return this.client;
  }

  /** Crée les buckets au démarrage (idempotent, n'échoue pas la requête). */
  async ensureBuckets(): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('MinIO non configuré : buckets non initialisés.');
      return;
    }
    const client = this.getClient();
    const buckets = this.config.get<Record<StorageBucket, string>>('storage.buckets');
    if (!buckets) return;

    for (const bucket of Object.values(buckets)) {
      try {
        const exists = await client.bucketExists(bucket);
        if (!exists) await client.makeBucket(bucket, this.config.get<string>('storage.region'));
      } catch (error) {
        this.logger.warn(`Bucket "${bucket}" indisponible : ${(error as Error).message}`);
      }
    }
    this.ready = true;
  }

  validateFile(bucket: StorageBucket, file: UploadedFileLike): void {
    const policy = BUCKET_POLICY[bucket];
    if (!file || !file.buffer) {
      throw BusinessException.badRequest('Fichier manquant.', ErrorCode.VALIDATION_ERROR);
    }
    if (file.size <= 0) {
      throw BusinessException.badRequest('Fichier vide.', ErrorCode.VALIDATION_ERROR);
    }
    if (file.size > policy.maxSize) {
      throw BusinessException.badRequest(
        `Fichier trop volumineux (max ${Math.round(policy.maxSize / 1024 / 1024)} Mo).`,
        ErrorCode.PAYLOAD_TOO_LARGE,
      );
    }
    if (!policy.mime[file.mimetype]) {
      throw BusinessException.badRequest(
        `Type de fichier non autorisé : ${file.mimetype}.`,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  }

  buildObjectKey(bucket: string, file: UploadedFileLike): string {
    const extension = this.extensionFor(file);
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${bucket}/${yyyy}/${mm}/${crypto.randomUUID()}.${extension}`;
  }

  private extensionFor(file: UploadedFileLike): string {
    const byMime =
      IMAGE_MIME[file.mimetype] ??
      DOCUMENT_MIME[file.mimetype] ??
      path.extname(file.originalname).replace('.', '').toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(byMime) ? byMime : 'bin';
  }

  async upload(
    bucket: StorageBucket,
    file: UploadedFileLike,
    metadata: Record<string, string> = {},
  ): Promise<StoredObject> {
    this.validateFile(bucket, file);
    const client = this.getClient();
    const bucketName = this.bucketName(bucket);
    const objectKey = this.buildObjectKey(bucketName, file);

    await client.putObject(bucketName, objectKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
      ...metadata,
    });

    return {
      bucket,
      objectKey,
      url: this.publicUrl(bucketName, objectKey),
      mimeType: file.mimetype,
      size: file.size,
      originalName: sanitizeOriginalName(file.originalname),
    };
  }

  async delete(bucket: StorageBucket, objectKey: string): Promise<void> {
    if (!objectKey) return;
    const client = this.getClient();
    try {
      await client.removeObject(this.bucketName(bucket), objectKey);
    } catch (error) {
      this.logger.warn(`Suppression objet impossible : ${(error as Error).message}`);
    }
  }

  /** URL signée temporaire (objets privés). */
  async getPresignedUrl(
    bucket: StorageBucket,
    objectKey: string,
    expirySeconds = 3600,
  ): Promise<string> {
    const client = this.getClient();
    return client.presignedGetObject(this.bucketName(bucket), objectKey, expirySeconds);
  }

  getStatus(): { configured: boolean; ready: boolean; buckets: Record<string, string> } {
    return {
      configured: this.isConfigured,
      ready: this.ready,
      buckets: (this.config.get<Record<StorageBucket, string>>('storage.buckets') ?? {}) as Record<
        string,
        string
      >,
    };
  }

  private bucketName(bucket: StorageBucket): string {
    const buckets = this.config.get<Record<StorageBucket, string>>('storage.buckets');
    const name = buckets?.[bucket];
    if (!name) throw BusinessException.badRequest('Bucket invalide.', ErrorCode.VALIDATION_ERROR);
    return name;
  }

  publicUrl(bucketName: string, objectKey: string): string {
    const base = (this.config.get<string>('storage.publicUrl') ?? '').replace(/\/$/, '');
    return `${base}/${bucketName}/${objectKey}`;
  }
}

function sanitizeOriginalName(name: string): string {
  return (name ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
