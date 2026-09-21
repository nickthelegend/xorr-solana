/**
 * Where a strategy's profit came from, as three bars against a shared scale.
 *
 * Gross profit, gross loss and what is left. One scale across all three — the widest bar is the
 * largest magnitude and every other is drawn against it — so a strategy that made a lot and lost
 * nearly as much looks like what it is, rather than three bars each filling their own row.
 *
 * ## Fees are a line, not a bar
 *
 * The familiar version of this chart draws commission as a fourth bar under the other two, as if
 * the net were what remained after subtracting it. In this book it is not: the recorded net already
 * equals gross profit plus gross loss, so the fees are inside the per-trade figures the averages
 * came from (`strategies/pnl.ts`). A fourth bar would be a deduction that has already happened, and
 * the three above it would no longer add up. So it is stated underneath instead, as a share of the
 * gross it is already part of.
 */
import React from 'react';
import { View } from 'react-native';
import { Text } from '../Text';
import { colors, radius, space } from '../tokens';
import type { PnlStructure } from '@/strategies/pnl';
import { usd } from '@/strategies/format';

const BAR_H = 10;
/** A bar for a figure that rounds to nothing still has to be visible as a bar. */
const MIN_W = 3;

function Bar({ label, value, scale, color }: { label: string; value: number; scale: number; color: string }) {
  const share = scale > 0 ? Math.abs(value) / scale : 0;
  return (
    <View style={{ marginBottom: space.s12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.s4 }}>
        <Text variant="bodySm" color={colors.ink70}>
          {label}
        </Text>
        <Text variant="bodySm" color={color} style={{ fontVariant: ['tabular-nums'] }}>
          {usd(value)}
        </Text>
      </View>
      <View style={{ height: BAR_H, borderRadius: radius.glyph, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(MIN_W, share * 100)}%`, height: '100%', backgroundColor: color, borderRadius: radius.glyph }} />
      </View>
    </View>
  );
}

export function PnlBars({ pnl }: { pnl: PnlStructure }) {
  const scale = Math.max(Math.abs(pnl.grossProfitUsd), Math.abs(pnl.grossLossUsd), Math.abs(pnl.netUsd));
  const netTone = pnl.netUsd > 0 ? colors.up : pnl.netUsd < 0 ? colors.down : colors.ink55;
  /* As a share of the gross it is part of: "$1.30 of fees" means nothing without the size it came out of. */
  const feeShare =
    pnl.feesUsd !== null && pnl.grossProfitUsd > 0 ? (pnl.feesUsd / pnl.grossProfitUsd) * 100 : null;

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.panel, padding: space.s16 }}>
      <Bar label="Gross profit" value={pnl.grossProfitUsd} scale={scale} color={colors.up} />
      <Bar label="Gross loss" value={pnl.grossLossUsd} scale={scale} color={colors.down} />
      <Bar label="Net" value={pnl.netUsd} scale={scale} color={netTone} />
      {pnl.feesUsd === null ? null : (
        <Text variant="bodySm" color={colors.ink55}>
          {usd(pnl.feesUsd)} of that went in fees
          {feeShare === null ? '' : `, ${feeShare.toFixed(0)}% of the gross profit`} — already inside the net above,
          not a further deduction.
        </Text>
      )}
    </View>
  );
}
