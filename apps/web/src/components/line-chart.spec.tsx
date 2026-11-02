import { render, screen } from '@testing-library/react';
import type { ReadingPointDto } from '@org/shared';
import { LineChart, axisBounds } from './line-chart';

const point = (hour: number, avg: number): ReadingPointDto => ({
  time: `2026-10-24T${String(hour).padStart(2, '0')}:00:00.000Z`,
  avg,
  min: avg,
  max: avg,
  samples: 1,
});

describe('axisBounds', () => {
  it('pads the data range and lands on round numbers', () => {
    const { min, max, step } = axisBounds([18.2, 23.7]);
    expect(min).toBeLessThanOrEqual(18.2);
    expect(max).toBeGreaterThanOrEqual(23.7);
    // Bounds sit on whole steps (compared with a float tolerance).
    expect(Math.abs(min / step - Math.round(min / step))).toBeLessThan(1e-9);
    expect(Math.abs(max / step - Math.round(max / step))).toBeLessThan(1e-9);
  });

  it('copes with a flat line', () => {
    const { min, max } = axisBounds([20, 20, 20]);
    expect(max).toBeGreaterThan(min);
  });

  it('keeps a fixed axis as given', () => {
    expect(axisBounds([40, 50], { min: 0, max: 100 })).toMatchObject({
      min: 0,
      max: 100,
    });
  });
});

describe('LineChart', () => {
  it('says so when there is nothing to draw', () => {
    render(<LineChart metric="soilHumidity" points={[]} />);
    expect(screen.getByText('No readings in this period yet.')).toBeTruthy();
  });

  it('draws the points and the threshold label', () => {
    render(
      <LineChart
        metric="soilHumidity"
        points={[point(8, 40), point(9, 35), point(10, 28)]}
        fixedAxis={{ min: 0, max: 100 }}
        threshold={30}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Soil moisture chart with 3 points' }),
    ).toBeTruthy();
    expect(screen.getByText('needs water below 30%')).toBeTruthy();
  });
});
