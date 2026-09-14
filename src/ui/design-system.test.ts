/**
 * The brief's rules, turned into failing tests.
 *
 * Everything here is a constraint from `design.md`, `animations.md` or the handoff brief
 * that a future edit could quietly break — the type scale drifting off the em conversions,
 * a `fontWeight` sneaking back in, green appearing as a selection colour, an `elevation`
 * on a card, a chart hardcoding a pixel.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FONTS } from './fonts';
import { colors, duration, radius, size, space } from './tokens';
import { type as typeScale, numericVariants, type TypeVariant } from './type';
import { MINUS, money, percent, price, quantity, wholeMoney } from './format';
import {
  axisLabels,
  axisPrices,
  candleGeometry,
  tightProjection,
  toPct,
  wideProjection,
  type Candle,
} from './charts/projection';
import { columns } from './charts/useMeasuredBox';

const UI = __dirname;
const VARIANTS = Object.keys(typeScale) as TypeVariant[];

function sources(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts')) {
        out.push({ rel: path.relative(UI, p), src: fs.readFileSync(p, 'utf8') });
      }
    }
  };
  walk(UI);
  return out;
}

/** design.md values are quoted throughout the docblocks; only real code counts. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

describe('type scale — design.md §2', () => {
  it('every variant names BOTH a bundled family and its weight', () => {
    // Neither alone is enough for the three platforms this ships to. Android does not
    // synthesise a weight for a custom family, so the family must encode it; web matches on
    // family AND weight through react-native-web's CSS, so dropping the weight leaves the
    // browser to choose one. See the docblock in `type.ts`.
    const families = Object.values(FONTS) as string[];
    for (const name of VARIANTS) {
      const v = typeScale[name];
      expect(families, `${name} uses an unbundled family`).toContain(v.fontFamily);
      expect(v.fontWeight, `${name} has no fontWeight — web will guess one`).toBeDefined();
      // And the two must agree, or the platforms disagree with each other.
      expect(FONTS[String(v.fontWeight) as keyof typeof FONTS], `${name} family/weight mismatch`)
        .toBe(v.fontFamily);
    }
  });

  it('every variant carries absolute lineHeight and letterSpacing, and kills font padding', () => {
    for (const name of VARIANTS) {
      const v = typeScale[name];
      expect(typeof v.lineHeight, `${name} lineHeight`).toBe('number');
      expect(typeof v.letterSpacing, `${name} letterSpacing`).toBe('number');
      expect(v.includeFontPadding, `${name} includeFontPadding`).toBe(false);
      expect(v.fontVariant, `${name} fontVariant`).toEqual(['tabular-nums']);
    }
  });

  it('nothing is below 9.5px', () => {
    for (const name of VARIANTS) {
      expect(typeScale[name].fontSize, `${name}`).toBeGreaterThanOrEqual(9.5);
    }
  });

  it('the em tracking converts to the points design.md implies', () => {
    // eyebrow .12em, tag .09em, tab label .03em — the three §2 states in em.
    expect(typeScale.eyebrow.letterSpacing).toBeCloseTo(11 * 0.12, 5);
    expect(typeScale.eyebrowSm.letterSpacing).toBeCloseTo(10 * 0.12, 5);
    expect(typeScale.tag.letterSpacing).toBeCloseTo(10 * 0.09, 5);
    expect(typeScale.tagSm.letterSpacing).toBeCloseTo(9.5 * 0.09, 5);
    expect(typeScale.tabLabel.letterSpacing).toBeCloseTo(9.5 * 0.03, 5);
  });

  it('the display roles keep the exact negative tracking §2 gives in points', () => {
    expect(typeScale.heroAmount).toMatchObject({ fontSize: 52, letterSpacing: -2 });
    expect(typeScale.heroBalance).toMatchObject({ fontSize: 46, letterSpacing: -1.4 });
    expect(typeScale.pnlHero).toMatchObject({ fontSize: 46, letterSpacing: -1.4 });
    for (const name of ['priceLg', 'priceMd', 'priceSm'] as const) {
      expect(typeScale[name].letterSpacing, name).toBe(-1.2);
    }
    // §2 states this one line-height outright: 26px at 1.2.
    expect(typeScale.onboardingTitle.lineHeight).toBeCloseTo(26 * 1.2, 5);
  });

  it('the numeric roles are all real variants', () => {
    for (const name of numericVariants) expect(VARIANTS).toContain(name);
  });
});

describe('motion — animations.md', () => {
  /*
   * 150/180/250 is the INTERACTION scale and is still closed. Three durations sit off it, each with
   * its reason in tokens.ts: `pulse`, the ambient skeleton loop; and — since 2026-09-12 — `enter` and
   * `draw`, a screen ARRIVING rather than a control responding. Anything else new still has to argue
   * its way in here first.
   */
  it('interaction is 150 / 180 / 250; arrival is enter and draw; the skeleton pulses', () => {
    const { pulse, enter, draw, ...interaction } = duration;
    expect(Object.values(interaction).sort((a, b) => a - b)).toEqual([150, 180, 250]);
    expect(enter).toBe(420);
    expect(draw).toBe(700);
    expect(pulse).toBe(900);
  });

  // The whole animated inventory:
  //   HoldButton      the stop's fill while it is held    600ms  (linear: the hold's clock, 2026-09-14)
  //   Switch          knob transform + track background   180ms
  //   Segmented       thumb background                    150ms
  //   Progress        track width                         250ms  ("reads as progress")
  //   States          skeleton block opacity, looping     900ms  (the only loop in the app)
  //   Rise            a section fading up into place      420ms  (arrival, 2026-09-12)
  //   RollingNumber   digits rising into their slots      420ms  (arrival, 28ms apart — never counting)
  //   AreaChart       the line revealed left to right     700ms  (arrival)
  //   Candlestick     the candles revealed left to right  700ms  (arrival)
  // A new entry here means a primitive started animating something the policy does not sanction.
  // Argue it into motion.ts first, or take the animation out.
  it('only the sanctioned primitives animate', () => {
    const animated = sources()
      .filter(({ src }) => /from 'react-native-reanimated'/.test(src))
      .map(({ rel }) => rel)
      .sort();
    expect(animated).toEqual([
      'HoldButton.tsx',
      'Progress.tsx',
      'Rise.tsx',
      'RollingNumber.tsx',
      'Segmented.tsx',
      'States.tsx',
      'Switch.tsx',
      'charts/AreaChart.tsx',
      'charts/Candlestick.tsx',
      'motion.ts',
    ]);
  });

  /*
   * The loop is allowed in exactly one file. `withRepeat` anywhere else is how an app acquires a
   * pulsing dot, a breathing button and a spinning badge one reasonable-seeming commit at a time.
   */
  it('nothing else in the design system loops', () => {
    const looping = sources()
      .filter(({ src }) => /withRepeat/.test(stripComments(src)))
      .map(({ rel }) => rel);
    expect(looping).toEqual(['States.tsx']);
  });

  /*
   * The skeleton may pulse; a figure may never. `Placeholder` renders an `Animated.View` and stands
   * in for a value that is ABSENT — the moment a real one exists the block is gone, so the price
   * rule is untouched. This pins that it never becomes a text node.
   */
  it('the skeleton animates a block, never a value', () => {
    const src = stripComments(fs.readFileSync(path.join(UI, 'States.tsx'), 'utf8'));
    expect(/Animated\.Text/.test(src)).toBe(false);
    expect(/Animated\.View/.test(src)).toBe(true);
  });

  it('no spring, no bounce, no custom bezier', () => {
    for (const { rel, src } of sources()) {
      expect(/withSpring|Easing\.bounce|Easing\.elastic|Easing\.bezier/.test(stripComments(src)), rel).toBe(
        false,
      );
    }
  });
});

describe('the one product rule — green and red are P&L only', () => {
  const PNL = ['colors.up', 'colors.down', 'colors.candleUp', 'colors.candleDown'];

  it('the selection primitives never reach for a P&L colour', () => {
    for (const file of ['Pill.tsx', 'Segmented.tsx', 'TabBar.tsx']) {
      const src = stripComments(fs.readFileSync(path.join(UI, file), 'utf8'));
      for (const token of PNL) {
        // TabBar's one green is the kill-switch status dot, which reports whether agents
        // are trading — not which tab is open.
        const allowed = file === 'TabBar.tsx' && token === 'colors.up';
        if (allowed) continue;
        expect(src.includes(token), `${file} uses ${token}`).toBe(false);
      }
    }
  });

  it('selection is white-on-dark', () => {
    const pill = stripComments(fs.readFileSync(path.join(UI, 'Pill.tsx'), 'utf8'));
    expect(pill).toMatch(/selected\s*\?[\s\S]*colors\.ink/);
  });
});

describe('platform rules', () => {
  it('no card carries an elevation — the 1px cardBorder is the whole separation', () => {
    for (const { rel, src } of sources()) {
      expect(/\belevation\b/.test(stripComments(src)), rel).toBe(false);
    }
  });

  it('no primitive declares a hover state', () => {
    for (const { rel, src } of sources()) {
      expect(/onHover|hovered|:hover/.test(stripComments(src)), rel).toBe(false);
    }
  });

  it('every Pressable goes through Press, which kills the Android ripple', () => {
    for (const { rel, src } of sources()) {
      if (rel === 'Press.tsx') continue;
      expect(/<Pressable\b/.test(stripComments(src)), `${rel} uses Pressable directly`).toBe(false);
    }
  });

  it('the touch-target floor is 44', () => {
    expect(size.hit).toBe(44);
    expect(size.stepperCircle).toBeLessThan(size.hit);
    expect(size.switchH).toBeLessThan(size.hit);
    expect(size.pillH).toBeLessThan(size.hit);
  });
});

describe('tokens', () => {
  it('the spacing scale is design.md §3 exactly', () => {
    const scale = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 34, 38, 44];
    for (const n of scale) expect(space[`s${n}` as keyof typeof space]).toBe(n);
    expect(space.gutter).toBe(20);
    expect(space.sheetGutter).toBe(16);
  });

  it('no colour is written as a bare hex outside tokens.ts', () => {
    // The rule that keeps the token table meaningful: if a primitive can type `#141516`,
    // the table stops being the single place a colour is decided, and the next change to
    // `surfaceAlt` misses whichever component spelled it out.
    const offenders: string[] = [];
    for (const { rel, src } of sources()) {
      if (rel === 'tokens.ts') continue;
      const code = stripComments(src);
      for (const m of code.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
        // SVG gradient/filter ids are `#id` references, not colours.
        if (/url\(#/.test(code.slice(Math.max(0, m.index! - 5), m.index! + 1))) continue;
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `bare hex outside tokens.ts:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the §1 colours are verbatim', () => {
    expect(colors.bg).toBe('#000000');
    expect(colors.surface).toBe('#0C0C0D');
    expect(colors.up).toBe('#2BD87A');
    expect(colors.down).toBe('#FF453A');
    expect(colors.warn).toBe('#E8C64A');
    expect(colors.candleUp).toBe('#16C060');
    expect(colors.candleDown).toBe('#EF3B36');
    expect(colors.hairline).toBe('rgba(255,255,255,0.05)');
    expect(colors.hairlineStrong).toBe('rgba(255,255,255,0.055)');
    expect(colors.cardBorder).toBe('rgba(255,255,255,0.06)');
    expect(colors.sheet.bg).toBe('#FFFFFF');
    expect(colors.sheet.fill).toBe('#F2F2F5');
    expect(colors.sheet.tick).toBe('#E4E4E9');
  });

  it('every agent gradient is a c1/c2 pair', () => {
    for (const [name, g] of Object.entries(colors.agent) as [string, { c1: string; c2: string }][]) {
      expect(g.c1, name).toMatch(/^#[0-9A-F]{6}$/i);
      expect(g.c2, name).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('radius covers every §3 band', () => {
    expect(radius.full).toBeGreaterThan(1000);
    expect([radius.panel, radius.panelXl]).toEqual([22, 26]);
    expect([radius.sheet, radius.sheetLg]).toEqual([30, 34]);
  });
});

describe('candle projection — design.md §6', () => {
  const series: Candle[] = [
    { open: 66120, high: 66480, low: 66020, close: 66400 },
    { open: 66400, high: 66520, low: 66180, close: 66240 },
    { open: 66300, high: 66620, low: 66240, close: 66560 },
  ];

  it('tight pads by a fifth of the range, capped at 120 — the prototype series still gets ±120', () => {
    // Range 600, a fifth is 120: the $66k prototype draws exactly as design.md §6 wrote it.
    expect(tightProjection(series)).toEqual({ hi: 66620 + 120, lo: 66020 - 120 });
  });

  it('a cheap asset fills the box instead of flattening into a line', () => {
    // AAVE at ~$126 with a two-dollar day. A fixed ±120 made the range 1% of the box.
    const cheap: Candle[] = [
      { open: 125.1, high: 126.4, low: 124.9, close: 126.0 },
      { open: 126.0, high: 126.9, low: 125.6, close: 126.2 },
    ];
    const p = tightProjection(cheap);
    const range = 126.9 - 124.9;
    expect(p.hi - p.lo).toBeCloseTo(range * 1.4, 6);
    expect((range / (p.hi - p.lo)) * 100).toBeGreaterThan(70);
  });

  it('wide brackets the TP and SL prices at ±150, at any setting', () => {
    // TP inside the series range: the series still sets the bound.
    expect(wideProjection(series, 66500, 66100)).toEqual({ hi: 66620 + 150, lo: 66020 - 150 });
    // TP outside it: the bound follows the marker, so it stays in frame.
    expect(wideProjection(series, 68000, 64000)).toEqual({ hi: 68000 + 150, lo: 64000 - 150 });
  });

  it('price maps to a percentage from the top', () => {
    const p = { hi: 100, lo: 0 };
    expect(toPct(p, 100)).toBe(0);
    expect(toPct(p, 0)).toBe(100);
    expect(toPct(p, 75)).toBe(25);
  });

  it('a doji still draws — the body floor is 1.4% of the box', () => {
    const p = tightProjection(series);
    const flat = candleGeometry(p, { open: 66300, high: 66400, low: 66200, close: 66300 });
    expect(flat.bodyHeightPct).toBe(1.4);
    expect(flat.up).toBe(true);
  });

  it('a down candle draws its body from open to close', () => {
    const p = { hi: 100, lo: 0 };
    const down = candleGeometry(p, { open: 80, high: 90, low: 50, close: 60 });
    expect(down.up).toBe(false);
    expect(down.bodyTopPct).toBe(20); // open, the higher of the two
    expect(down.bodyHeightPct).toBe(20); // down to the close
    expect(down.wickTopPct).toBe(10);
    expect(down.wickHeightPct).toBe(40);
  });

  it('axis prices derive from the active projection', () => {
    expect(axisPrices({ hi: 100, lo: 0 })).toEqual([100, 75, 50, 25, 0]);
  });

  it('charts hold no pixel positions of their own', () => {
    for (const { rel, src } of sources()) {
      if (!rel.startsWith('charts')) continue;
      const code = stripComments(src);
      // Coordinates are computed from the projection and the measured box. A literal 0
      // is an origin, not a placed pixel — anything else is a hand-placed coordinate.
      expect(
        /\b(?:x|y|x1|y1|x2|y2|cx|cy)=\{(?:[1-9][0-9]*|0\.[0-9]+)(?:\.[0-9]+)?\}/.test(code),
        rel,
      ).toBe(false);
    }
  });
});

describe('formatting — state.md', () => {
  it('negatives use U+2212, not a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(money(-4.22, { signed: true })).toBe('−$4.22');
    expect(percent(-5.4)).toBe('−5.4%');
    expect(money(-4.22).includes('-')).toBe(false);
  });

  it('anything over 999 keeps its separators', () => {
    expect(money(4862.18)).toBe('$4,862.18');
    expect(wholeMoney(66560)).toBe('$66,560');
    expect(quantity(1750.3)).toBe('1,750.3000');
  });

  it('a price takes the decimals its magnitude calls for', () => {
    expect(price(66560)).toBe('$66,560');
    expect(price(88.32)).toBe('$88.32');
    expect(price(0.1842)).toBe('$0.1842');
  });

  it('percentages are always signed to one decimal', () => {
    expect(percent(1)).toBe('+1.0%');
    expect(percent(0)).toBe('+0.0%');
  });
});

describe('edge cases — section W of docs/QA-UI-PLAN.md', () => {
  it('an empty series projects without NaN', () => {
    const p = tightProjection([]);
    expect(Number.isFinite(p.hi)).toBe(true);
    expect(Number.isFinite(p.lo)).toBe(true);
    expect(axisPrices(p).every(Number.isFinite)).toBe(true);
  });

  it('a flat projection returns the midpoint rather than NaN', () => {
    // hi === lo would divide by zero. Every value maps to the vertical centre instead.
    expect(toPct({ hi: 100, lo: 100 }, 100)).toBe(50);
    expect(toPct({ hi: 100, lo: 100 }, 50)).toBe(50);
    const g = candleGeometry({ hi: 100, lo: 100 }, { open: 100, high: 100, low: 100, close: 100 });
    expect(Number.isFinite(g.bodyTopPct)).toBe(true);
    expect(Number.isFinite(g.wickHeightPct)).toBe(true);
    expect(g.bodyHeightPct).toBe(1.4);
  });

  it('a single candle projects without dividing by zero', () => {
    const one = [{ open: 10, high: 12, low: 8, close: 11 }];
    const p = tightProjection(one);
    // Range 4, a fifth is 0.8 — relative padding, not the old fixed 120.
    expect(p.hi).toBeCloseTo(12.8, 9);
    expect(p.lo).toBeCloseTo(7.2, 9);
    expect(Number.isFinite(candleGeometry(p, one[0]!).bodyTopPct)).toBe(true);
  });

  it('a zero-width box yields no negative column geometry', () => {
    for (const [w, n] of [[0, 12], [0, 0], [100, 0]] as const) {
      const { columnWidth, xOf } = columns(w, n, 6);
      expect(columnWidth).toBeGreaterThanOrEqual(0);
      expect(xOf(0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('the axis is keyed by position, because a flat series repeats its labels', () => {
    const labels = axisLabels({ hi: 100, lo: 100 });
    expect(new Set(labels).size).toBe(1); // all five are the same string
    const src = fs.readFileSync(path.join(UI, 'charts', 'Candlestick.tsx'), 'utf8');
    expect(src).toMatch(/axisLabels\([^)]*\)\.map\(\(label, i\) =>/);
    expect(src).toMatch(/key=\{i\}/);
  });

  it('a grid cell lays its tile out on the axis the tile was written for', () => {
    // `StatTile` carries `flex: 1` so a ROW of tiles shares its width. `flex: 1` also sets
    // `flexBasis: 0`, so in a COLUMN container it zeroes the tile's HEIGHT instead — which
    // rendered the contract screen's 2x2 grid as four empty boxes with hairline gutters and
    // no text. The cell must therefore be a row.
    const src = sources().find((f) => f.rel === 'StatTile.tsx')!.src;
    const grid = src.slice(src.indexOf('export function StatGrid'));
    expect(grid).toMatch(/flexDirection:\s*'row'/);
  });

  it('a stat value never truncates — only its label may', () => {
    const src = fs.readFileSync(path.join(UI, 'StatTile.tsx'), 'utf8');
    // The Eyebrow takes numberOfLines; the Value must not.
    expect(src).toMatch(/<Eyebrow[^>]*numberOfLines=\{1\}/s);
    // The JSX element, not the `<Value>` mentioned in the docblock above it.
    const open = src.indexOf('<Value\n');
    expect(open).toBeGreaterThan(-1);
    const valueTag = src.slice(open, src.indexOf('>', src.indexOf('{value}')));
    expect(valueTag).not.toMatch(/numberOfLines/);
  });

  it('an empty series draws nothing — no invented price axis', () => {
    const src = fs.readFileSync(path.join(UI, 'charts', 'Candlestick.tsx'), 'utf8');
    expect(src).toMatch(/const hasData = series\.length > 0;/);
    expect(src).toMatch(/box\.width > 0 && hasData/);
  });
});
