import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';
import { APP_CONFIG, type AppConfig } from './config/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.use(cookieParser());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  // Lets the MQTT connection and the DB pool close cleanly on SIGTERM.
  app.enableShutdownHooks();
  // In production the API sits behind a reverse proxy that terminates TLS, so
  // the client address and protocol come from its forwarded headers. Without
  // this every request would share the proxy's address in the rate limiter.
  if (config.isProduction) app.set('trust proxy', 1);

  await app.listen(config.port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${config.port}/${globalPrefix}`,
  );
}

bootstrap();
