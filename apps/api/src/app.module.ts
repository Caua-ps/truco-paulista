import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { FriendsModule } from './friends/friends.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { RankingModule } from './ranking/ranking.module';
import { RedisModule } from './redis/redis.module';
import { StoreModule } from './store/store.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Logs estruturados (JSON em produção, coloridos e legíveis em dev).
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        // Não vaze tokens/senhas nos logs de requisição.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
      },
    }),
    // Rate limiting global: 100 requisições por minuto por IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    RankingModule,
    StoreModule,
    AdminModule,
    GameModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
