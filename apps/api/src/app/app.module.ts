import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { GatewaysModule } from '../gateways/gateways.module';
import { IngestModule } from '../ingest/ingest.module';
import { MailModule } from '../mail/mail.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { PairingModule } from '../pairing/pairing.module';
import { PlantersModule } from '../planters/planters.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // A generous default for everything; the credential and pairing routes
    // override it with a much tighter limit.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ConfigModule,
    DbModule,
    MailModule,
    MqttModule,
    AuthModule,
    PairingModule,
    IngestModule,
    GatewaysModule,
    PlantersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
