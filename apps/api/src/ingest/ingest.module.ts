import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';

@Module({ providers: [IngestService] })
export class IngestModule {}
