import { BadRequestException } from '@nestjs/common';
import { PLANT_LIFECYCLES } from '@org/shared';
import { plantLifecycle } from '@org/db';
import { z } from 'zod';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from './pg-errors';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ name: z.string().trim().min(1), n: z.coerce.number().int() }),
  );

  it('returns the parsed value, with transforms applied', () => {
    expect(pipe.transform({ name: '  a ', n: '3' })).toEqual({
      name: 'a',
      n: 3,
    });
  });

  it('reports every issue with its path', () => {
    try {
      pipe.transform({ name: '', n: 'x' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const { issues } = (error as BadRequestException).getResponse() as {
        issues: { path: string }[];
      };
      expect(issues.map((i) => i.path).sort()).toEqual(['n', 'name']);
    }
  });
});

describe('pgErrorCode', () => {
  it('finds the code on the error itself or on a wrapped cause', () => {
    expect(pgErrorCode({ code: PG_UNIQUE_VIOLATION })).toBe('23505');
    expect(
      pgErrorCode(new Error('wrapped', { cause: { code: '23503' } })),
    ).toBe('23503');
  });

  it('returns undefined when there is none', () => {
    expect(pgErrorCode(new Error('plain'))).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});

describe('contracts shared with the database', () => {
  it('lists the same plant lifecycles as the database enum', () => {
    expect([...PLANT_LIFECYCLES]).toEqual([...plantLifecycle.enumValues]);
  });
});
