import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../shared/redis/redis.service';
import { StorageService } from '../shared/storage/storage.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'État de santé de l’API (PostgreSQL, Redis, MinIO)' })
  async check() {
    let database = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    const redisUp = await this.redis.ping();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis: redisUp ? 'up' : 'down',
        storage: this.storage.getStatus().configured ? 'configured' : 'not-configured',
      },
    };
  }
}
