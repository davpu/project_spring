import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { GatewayDto } from '@org/shared';
import { AuthGuard, UserId } from '../auth/auth.guard';
import { GatewaysService } from './gateways.service';

@Controller('gateways')
@UseGuards(AuthGuard)
export class GatewaysController {
  constructor(private readonly gateways: GatewaysService) {}

  @Get()
  list(@UserId() userId: string): Promise<GatewayDto[]> {
    return this.gateways.list(userId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.gateways.remove(userId, id);
  }
}
