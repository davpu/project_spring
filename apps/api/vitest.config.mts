import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  // Nest's dependency injection reads constructor parameter types from
  // emitted decorator metadata, which esbuild (vite's default) does not produce.
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    name: 'api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    // Integration specs share one database; running files in parallel would
    // make their cleanup interfere with each other.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-0123',
      MQTT_ADMIN_USER: 'api',
      MQTT_ADMIN_PASSWORD: 'test',
      // CI provides its own; locally this is the docker compose database.
      DATABASE_URL:
        process.env['DATABASE_URL'] ??
        'postgres://spring:spring@localhost:5433/spring',
    },
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
