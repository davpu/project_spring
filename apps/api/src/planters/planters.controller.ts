import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePlantRequestSchema,
  ReadingsQuerySchema,
  UpdatePlantRequestSchema,
  UpdatePlanterRequestSchema,
  type CreatePlantRequest,
  type PlanterDetailDto,
  type PlanterDto,
  type PlantDto,
  type ReadingsQuery,
  type ReadingsResponse,
  type UpdatePlantRequest,
  type UpdatePlanterRequest,
} from '@org/shared';
import { AuthGuard, UserId } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PlantersService } from './planters.service';

@Controller()
@UseGuards(AuthGuard)
export class PlantersController {
  constructor(private readonly planters: PlantersService) {}

  @Get('planters')
  list(@UserId() userId: string): Promise<PlanterDto[]> {
    return this.planters.list(userId);
  }

  @Get('planters/:id')
  get(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlanterDetailDto> {
    return this.planters.get(userId, id);
  }

  @Patch('planters/:id')
  rename(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePlanterRequestSchema))
    body: UpdatePlanterRequest,
  ): Promise<PlanterDto> {
    return this.planters.rename(userId, id, body);
  }

  @Delete('planters/:id')
  @HttpCode(204)
  remove(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.planters.remove(userId, id);
  }

  @Get('planters/:id/readings')
  readings(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ReadingsQuerySchema)) query: ReadingsQuery,
  ): Promise<ReadingsResponse> {
    return this.planters.readings(userId, id, query);
  }

  @Post('planters/:id/plants')
  createPlant(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreatePlantRequestSchema))
    body: CreatePlantRequest,
  ): Promise<PlantDto> {
    return this.planters.createPlant(userId, id, body);
  }

  @Patch('plants/:id')
  updatePlant(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePlantRequestSchema))
    body: UpdatePlantRequest,
  ): Promise<PlantDto> {
    return this.planters.updatePlant(userId, id, body);
  }

  @Delete('plants/:id')
  @HttpCode(204)
  removePlant(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.planters.removePlant(userId, id);
  }
}
