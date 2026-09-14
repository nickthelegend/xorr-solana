/**
 * The line's projection, which the line, the scrub's crosshair and a fill's mark all draw from (FEATURES.md #9, #45).
 * If these three ever used different arithmetic, a mark would float beside the line it belongs on.
 */
import { describe, expect, it } from 'vitest';
import { lineFrame, linePaths, lineX, lineY, nearestIndex } from './line';

/** 100 wide and 50 tall inside a 2pt inset. */
const BOX = { width: 104, height: 54 };

describe('where a value lands', () => {
  const f = lineFrame([10, 20, 30], BOX, 2);

  it('spreads the points evenly inside the inset, the extent touching its edges', () => {
    expect([lineX(f, 0), lineX(f, 1), lineX(f, 2)]).toEqual([2, 52, 102]);
    expect(lineY(f, 30)).toBe(2);
    expect(lineY(f, 10)).toBe(52);
  });

  it('puts a fractional position between its two points', () => {
    expect(lineX(f, 0.5)).toBe(27);
    expect(lineX(f, 1.25)).toBe(64.5);
  });

  it('draws the line and closes the area along the bottom of the box', () => {
    const { line, area } = linePaths(f, [10, 20, 30]);
    expect(line).toBe('M 2,52 L 52,27 L 102,2');
    expect(area).toBe('M 2,52 L 52,27 L 102,2 L 102,54 L 2,54 Z');
  });

  it('makes room for a mark priced beyond every point, on the same scale as the line', () => {
    const marked = lineFrame([10, 20, 30], BOX, 2, undefined, [5]);
    expect(marked.min).toBe(5);
    expect(lineY(marked, 5)).toBe(52);
    expect(lineY(marked, 30)).toBe(2);
  });

  it('keeps bounds a screen fixed, marks or not', () => {
    const fixed = lineFrame([10, 20, 30], BOX, 2, { min: 0, max: 40 }, [5, 50]);
    expect([fixed.min, fixed.max]).toEqual([0, 40]);
  });

  it('centres a single point, and projects an empty or flat series without NaN', () => {
    expect(lineX(lineFrame([7], BOX, 2), 0)).toBe(52);
    const empty = lineFrame([], BOX, 2);
    expect([empty.min, empty.max]).toEqual([0, 1]);
    expect(linePaths(empty, [])).toEqual({ line: '', area: '' });
    expect(Number.isFinite(lineY(lineFrame([4, 4], BOX, 2), 4))).toBe(true);
  });
});

describe('the point under a finger', () => {
  const f = lineFrame([10, 20, 30], BOX, 2);

  it('is the nearest point, halfway breaking toward the later one', () => {
    expect(nearestIndex(f, 26)).toBe(0);
    expect(nearestIndex(f, 27)).toBe(1);
    expect(nearestIndex(f, 60)).toBe(1);
    expect(nearestIndex(f, 90)).toBe(2);
  });

  it('holds the end point when the finger runs off either edge', () => {
    expect(nearestIndex(f, -40)).toBe(0);
    expect(nearestIndex(f, 500)).toBe(2);
  });

  it('is nothing on an empty series, and the one point on a single one', () => {
    expect(nearestIndex(lineFrame([], BOX, 2), 10)).toBeNull();
    expect(nearestIndex(lineFrame([7], BOX, 2), 90)).toBe(0);
    expect(nearestIndex(lineFrame([1, 2], { width: 4, height: 10 }, 2), 3)).toBe(0);
  });
});
