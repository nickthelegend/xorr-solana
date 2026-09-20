/**
 * The research book as rows on Home.
 *
 * Each row is one strategy and the only number that means anything about it: its out-of-sample
 * return. The in-sample figure — what it scored on the data it was fitted to — is deliberately not
 * here, because a list is skimmed and a fitted number skimmed next to a real one reads as the same
 * kind of thing. It is on the detail screen, beside the honest one, where they can be compared.
 *
 * A strategy that did not clear the gauntlet says so on the row rather than being hidden from a
 * caller who asked to see everything: "313 tested, 10 survived" is the result, and the 303 are
 * the evidence for it.
 */
import React from 'react';
import { View } from 'react-native';
import { Row } from './Row';
import { Rise } from './Rise';
import { Text } from './Text';
import { colors, space, size, radius } from './tokens';
import type { StrategySummary } from '@/data/strategyLibrary';

/** Out-of-sample return, signed, or the honest absence of one. */
function ReturnValue({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <Text variant="rowPrimary" color={colors.ink55}>
        Not measured
      </Text>
    );
  }
  const tone = pct > 0 ? colors.up : pct < 0 ? colors.down : colors.ink55;
  return (
    <Text variant="rowPrimary" color={tone} style={{ fontVariant: ['tabular-nums'] }}>
      {pct > 0 ? '+' : ''}
      {pct.toFixed(2)}%
    </Text>
  );
}

/**
 * The badge that carries the verdict.
 *
 * Green is not "it made money" — several survivors return well under one percent. It is "it held up
 * out of sample, through a parameter sweep, at double the commission, on assets it was not tuned
 * on". That is a much narrower claim and the only one the data supports.
 */
function Verdict({ survives }: { survives: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: space.s8,
        paddingVertical: 2,
        borderRadius: radius.glyph,
        backgroundColor: survives ? 'rgba(43,216,122,0.14)' : colors.surfaceAlt,
      }}
    >
      <Text variant="eyebrowSm" color={survives ? colors.up : colors.ink55}>
        {survives ? 'SURVIVED' : 'CUT'}
      </Text>
    </View>
  );
}

export function StrategyRows({
  rows,
  onOpen,
  from = 0,
}: {
  rows: StrategySummary[];
  onOpen: (id: string) => void;
  from?: number;
}) {
  return (
    <>
      {rows.map((s, i) => (
        <Rise key={s.id} index={from + i}>
          <Row
            height={size.rowLg}
            divider={i < rows.length - 1}
            onPress={() => onOpen(s.id)}
            left={<Verdict survives={s.survives} />}
            title={s.name}
            secondary={
              /* What the number is measured over, so the row never implies a live track record. */
              s.trades === null
                ? (s.family ?? 'Backtested')
                : `${s.family ?? 'Backtested'} · ${s.trades} trades out of sample`
            }
            value={<ReturnValue pct={s.returnPct} />}
            delta={
              s.sharpe === null ? undefined : (
                <Text variant="bodySm" color={colors.ink55} style={{ fontVariant: ['tabular-nums'] }}>
                  Sharpe {s.sharpe.toFixed(2)}
                </Text>
              )
            }
            figure="market"
          />
        </Rise>
      ))}
    </>
  );
}
