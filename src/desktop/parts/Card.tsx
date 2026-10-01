/**
 * A desktop page's card (2026-10-01): the one panel every wide page is built from.
 *
 * On a phone the sections of a screen are separated by space and a sheet; on a laptop they sit side by side, and side by
 * side they need an edge, or two columns of rows run into each other. The edge is the phone's own card recipe — the
 * surface a notch above black, a hairline and the panel radius — so a desktop page reads as the same app, not a theme.
 *
 * `title` and `right` make the header row most cards want (a name, and a link or a figure beside it); a card that
 * draws its own header leaves both out.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Eyebrow, colors, radius, space } from '@/ui';

export const CARD_PADDING = 22;

export function Card({
  title,
  right,
  children,
  style,
  testID,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: radius.panel,
          padding: CARD_PADDING,
          minWidth: 0,
        },
        style,
      ]}
    >
      {title !== undefined || right !== undefined ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, marginBottom: space.s16 }}>
          {title !== undefined ? <Eyebrow>{title}</Eyebrow> : null}
          <View style={{ flex: 1 }} />
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}
