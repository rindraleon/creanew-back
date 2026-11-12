import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
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

export type StorageDriver = 'minio' | 'local';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  get driver(): StorageDriver {
    return this.isConfigured ? 'minio' : 'local';
  }

  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('storage.accessKey') && this.config.get<string>('storage.secretKey'),
    );
  }

  get localDir(): string {
    const configured = this.config.get<string>('storage.localDir');
    return path.resolve(configured?.trim() ? configured : 'uploads');
  }

  get publicPrefix(): string {
    return (this.config.get<string>('storage.localUrlPrefix') ?? '/uploads').replace(/\/$/, '');
  }

  /** Bucket physique unique utilisé pour tous les fichiers du projet. */
  get bucket(): string {
    return this.config.get<string>('storage.bucket') ?? 'creanew';
  }

  /** Préfixes logiques (dossiers) utilisés à l'intérieur du bucket unique. */
  get prefixes(): StorageBucket[] {
    return Object.values(StorageBucket);
  }

  private getClient(): Minio.Client {
    this.client ??= new Minio.Client({
      endPoint: this.config.get<string>('storage.endpoint') ?? 'localhost',
      port: this.config.get<number>('storage.port') ?? 9000,
      useSSL: this.config.get<boolean>('storage.useSSL') ?? false,
      accessKey: this.config.get<string>('storage.accessKey') ?? '',
      secretKey: this.config.get<string>('storage.secretKey') ?? '',
      region: this.config.get<string>('storage.region') ?? 'mg-central-1',
    });
    return this.client;
  }

  async ensureBuckets(): Promise<void> {
    if (this.driver === 'local') {
      try {
        await fsp.mkdir(this.localDir, { recursive: true });
        this.ready = true;
        this.logger.log(`Stockage local initialisé : ${this.localDir}`);
      } catch (error) {
        this.logger.error(`Stockage local indisponible : ${(error as Error).message}`);
      }
      return;
    }

    const name = this.bucket;
    try {
      const client = this.getClient();
      const exists = await client.bucketExists(name);
      if (!exists) await client.makeBucket(name, this.config.get<string>('storage.region'));
      this.ready = true;
      this.logger.log(`Bucket MinIO "${name}" prêt.`);
    } catch (error) {
      this.logger.warn(`Bucket "${name}" indisponible : ${(error as Error).message}`);
    }
  }

  validateFile(bucket: StorageBucket, file: UploadedFileLike): void {
    const policy = BUCKET_POLICY[bucket];
    if (!policy) {
      throw BusinessException.badRequest('Bucket invalide.', ErrorCode.VALIDATION_ERROR);
    }
    if (!file?.buffer) {
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

  buildObjectKey(prefix: string, file: UploadedFileLike): string {
    const extension = this.extensionFor(file);
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${prefix}/${yyyy}/${mm}/${crypto.randomUUID()}.${extension}`;
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
    const bucketName = this.bucketName(bucket);
    const objectKey = this.buildObjectKey(bucket, file);

    if (this.driver === 'local') {
      const target = this.localPath(objectKey, true);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, file.buffer);
    } else {
      await this.getClient().putObject(bucketName, objectKey, file.buffer, file.size, {
        'Content-Type': file.mimetype,
        ...metadata,
      });
    }

    return {
      bucket,
      objectKey,
      url: this.publicUrl(objectKey),
      mimeType: file.mimetype,
      size: file.size,
      originalName: sanitizeOriginalName(file.originalname),
    };
  }

  async delete(bucket: StorageBucket, objectKey: string): Promise<void> {
    if (!objectKey) return;
    const bucketName = this.bucketName(bucket);
    try {
      if (this.driver === 'local') {
        await fsp.rm(this.localPath(objectKey), { force: true });
      } else {
        await this.getClient().removeObject(bucketName, objectKey);
      }
    } catch (error) {
      this.logger.warn(`Suppression objet impossible : ${(error as Error).message}`);
    }
  }

  async deleteByKey(objectKey: string | null | undefined): Promise<void> {
    if (!objectKey) return;
    const prefix = objectKey.split('/')[0];
    if (!(this.prefixes as string[]).includes(prefix)) return;
    await this.delete(prefix as StorageBucket, objectKey);
  }

  async getPresignedUrl(
    bucket: StorageBucket,
    objectKey: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (this.driver === 'local') {
      return this.publicUrl(objectKey);
    }
    return this.getClient().presignedGetObject(this.bucketName(bucket), objectKey, expirySeconds);
  }

  getStatus(): {
    driver: StorageDriver;
    configured: boolean;
    ready: boolean;
    bucket: string;
    prefixes: StorageBucket[];
  } {
    return {
      driver: this.driver,
      configured: this.isConfigured,
      ready: this.ready,
      bucket: this.bucket,
      prefixes: this.prefixes,
    };
  }

  private bucketName(bucket: StorageBucket): string {
    if (!(this.prefixes as string[]).includes(bucket)) {
      throw BusinessException.badRequest('Bucket invalide.', ErrorCode.VALIDATION_ERROR);
    }
    return this.bucket;
  }

  private localPath(objectKey: string, createRoot = false): string {
    const root = path.resolve(this.localDir);
    const target = path.resolve(root, objectKey.replace(/^\/+/, ''));
    if (createRoot) return target;
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw BusinessException.badRequest('Chemin de fichier invalide.', ErrorCode.VALIDATION_ERROR);
    }
    return target;
  }

  publicUrl(objectKey: string): string {
    const key = objectKey.trim().replace(/^\/+/, '');
    if (this.driver === 'local') {
      return `${this.publicPrefix}/${key}`;
    }
    const base = (this.config.get<string>('storage.publicUrl') ?? '').replace(/\/$/, '');
    if (key.startsWith(`${this.bucket}/`)) return `${base}/${key}`;
    return `${base}/${this.bucket}/${key}`;
  }

  urlForKey(objectKey: string): string {
    return this.publicUrl(objectKey);
  }

  isLocalFile(pathname: string): boolean {
    if (this.driver !== 'local' || !pathname.startsWith(`${this.publicPrefix}/`)) return false;
    const relative = pathname.slice(this.publicPrefix.length + 1);
    const resolved = path.resolve(this.localDir, relative);
    return resolved.startsWith(`${path.resolve(this.localDir)}${path.sep}`);
  }

  localFileExists(pathname: string): boolean {
    if (!this.isLocalFile(pathname)) return false;
    const relative = pathname.slice(this.publicPrefix.length + 1);
    return fs.existsSync(path.resolve(this.localDir, relative));
  }
}

function sanitizeOriginalName(name: string): string {
  return (name ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
