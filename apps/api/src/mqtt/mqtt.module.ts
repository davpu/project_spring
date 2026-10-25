import { Global, Module } from '@nestjs/common';
import { DynsecService } from './dynsec.service';
import { MqttService } from './mqtt.service';

@Global()
@Module({
  providers: [MqttService, DynsecService],
  exports: [MqttService, DynsecService],
})
export class MqttModule {}
