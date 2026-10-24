import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Database } from '@org/db';
import { sql } from '@org/db';
import { DB } from '../db/db.module';
import { MqttService } from '../mqtt/mqtt.service';

interface Health {
  status: 'ok' | 'degraded';
  db: boolean;
  mqtt: boolean;
}

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mqtt: MqttService,
  ) {}

  @Get()
  async check(): Promise<Health> {
    const db = await this.db.execute(sql`select 1`).then(
      () => true,
      () => false,
    );
    const mqtt = this.mqtt.connected;
    return { status: db && mqtt ? 'ok' : 'degraded', db, mqtt };
  }
}
