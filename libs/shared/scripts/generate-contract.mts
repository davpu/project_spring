/**
 * Writes the generated contract artifacts. Run with `pnpm contract:gen`.
 *
 * The artifacts are committed, and `codegen.spec.ts` fails if they drift from
 * the schema, so CI catches a forgotten regeneration.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACTS,
  SOURCE_OF_TRUTH,
  buildFirmwareHeader,
  buildGatewayMeta,
  buildTelemetryJsonSchema,
  formatJson,
} from '../src/lib/codegen.js';

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const outputs: [string, string][] = [
  [ARTIFACTS.jsonSchema, formatJson(buildTelemetryJsonSchema())],
  [ARTIFACTS.gatewayMeta, formatJson(buildGatewayMeta())],
  [ARTIFACTS.firmwareHeader, buildFirmwareHeader()],
];

console.log(`contract:gen (from ${SOURCE_OF_TRUTH})`);
for (const [relativePath, contents] of outputs) {
  const absolute = join(repoRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  console.log(`  ${relativePath}`);
}
