import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreatePairingCodeRequestSchema,
  PairRequestSchema,
  type CreatePairingCodeRequest,
  type CreatePairingCodeResponse,
  type PairRequest,
  type PairResponse,
  type PairingStatusResponse,
} from '@org/shared';
import { AuthGuard, UserId } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PairingService } from './pairing.service';

@Controller()
export class PairingController {
  constructor(private readonly pairing: PairingService) {}

  /** Web app: start pairing. */
  @Post('pairing-codes')
  @UseGuards(AuthGuard)
  createCode(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(CreatePairingCodeRequestSchema))
    body: CreatePairingCodeRequest,
  ): Promise<CreatePairingCodeResponse> {
    return this.pairing.createCode(userId, body.gatewayName);
  }

  /** Web app: poll until the gateway has redeemed the code. */
  @Get('pairing-codes/:id')
  @UseGuards(AuthGuard)
  getStatus(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PairingStatusResponse> {
    return this.pairing.getStatus(userId, id);
  }

  /**
   * Gateway, unauthenticated: the code is the credential. The tight limit is
   * what stands between the ~39-bit code space and a brute-force attempt.
   */
  @Post('pair')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  pair(
    @Body(new ZodValidationPipe(PairRequestSchema)) body: PairRequest,
  ): Promise<PairResponse> {
    return this.pairing.redeem(body.code);
  }
}
