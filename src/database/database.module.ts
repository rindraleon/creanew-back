import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        // synchronize uniquement en secours local, jamais en production.
        synchronize: config.get<boolean>('database.synchronize') ?? false,
        logging: config.get<boolean>('database.logging') ? ['error', 'warn', 'schema'] : ['error'],
        migrations: [__dirname + '/migrations*.entity{.ts,.js}'],
      }),
    }),
  ],
})
export class DatabaseModule {}
