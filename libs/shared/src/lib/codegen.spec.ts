import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ARTIFACTS,
  buildFirmwareHeader,
  buildGatewayMeta,
  buildTelemetryJsonSchema,
  formatJson,
} from './codegen.js';

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');

function committed(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

const STALE =
  'generated contract artifact is out of date - run `pnpm contract:gen` and commit the result';

describe('generated contract artifacts', () => {
  it('matches the committed JSON Schema', () => {
    expect(committed(ARTIFACTS.jsonSchema), STALE).toBe(
      formatJson(buildTelemetryJsonSchema()),
    );
  });

  it('matches the committed gateway metadata', () => {
    expect(committed(ARTIFACTS.gatewayMeta), STALE).toBe(
      formatJson(buildGatewayMeta()),
    );
  });

  it('matches the committed firmware header', () => {
    expect(committed(ARTIFACTS.firmwareHeader), STALE).toBe(
      buildFirmwareHeader(),
    );
  });
});

describe('JSON Schema stays loadable by the gateway', () => {
  const schema = buildTelemetryJsonSchema();

  it('targets the draft Node-RED can compile', () => {
    expect(schema['$schema']).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('carries no format keyword', () => {
    // Node-RED's ajv has no ajv-formats plugin and refuses to compile a schema
    // with an unknown format, so this would break the gateway at startup.
    expect(JSON.stringify(schema)).not.toContain('"format"');
  });

  it('carries no multipleOf keyword', () => {
    // Zod checks multipleOf float-safely; the ajv build inside Node-RED
    // rejects roughly a third of all one-decimal values (0.3, 0.6, 1.2, ...).
    // In the schema it silently dropped valid readings at the gateway and made
    // the generated validator disagree with the Zod one it comes from.
    expect(JSON.stringify(schema)).not.toContain('"multipleOf"');
  });

  it('requires at least one measurement, like the Zod schema does', () => {
    expect(schema['anyOf']).toEqual([
      { required: ['airTemperature'] },
      { required: ['airHumidity'] },
      { required: ['soilHumidity'] },
    ]);
  });
});
