import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private unavailable = false;

  constructor(private readonly config: ConfigService) {}

  getClient(): Redis | null {
    if (this.unavailable) return null;
    if (this.client) return this.client;

    try {
      this.client = new Redis({
        host: this.config.get<string>('redis.host') ?? 'localhost',
        port: this.config.get<number>('redis.port') ?? 6379,
        password: this.config.get<string>('redis.password') || undefined,
        db: this.config.get<number>('redis.db') ?? 0,
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });
      this.client.on('error', (error: Error) => {
        this.logger.warn(`Redis indisponible : ${error.message}`);
      });
      return this.client;
    } catch (error) {
      this.unavailable = true;
      this.logger.warn(`Redis non initialisé : ${(error as Error).message}`);
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await client.set(key, payload);
      }
      return true;
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<number> {
    const client = this.getClient();
    if (!client || keys.length === 0) return 0;
    try {
      return await client.del(...keys);
    } catch {
      return 0;
    }
  }

  async delByPattern(pattern: string): Promise<number> {
    const client = this.getClient();
    if (!client) return 0;
    try {
      const keys = await client.keys(pattern);
      if (keys.length === 0) return 0;
      return await client.del(...keys);
    } catch {
      return 0;
    }
  }

  async ping(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}
