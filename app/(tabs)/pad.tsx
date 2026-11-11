/** Pad extends the approved app UI: existing type, tokens, buttons and approval cards. */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Screen, SheetCard, Text, colors, radius, space } from '@/ui';
import { usePad } from '@/pad/usePad';

export default function Pad() {
  const pad = usePad();
  return <Screen tabBar>
    <Text variant="screenTitle">Pad</Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.s16, paddingTop: space.s16, paddingBottom: space.s30 }}>
      <SheetCard bordered borderRadius={radius.panel} padding={space.s14}>
        <Text variant="rowPrimary">xorrpad</Text>
        <Text variant="secondary" color={colors.ink55}>Link · {pad.link.state}</Text>
        <Text variant="secondary" color={colors.ink55}>Firmware · {pad.link.firmware ?? 'Connect to read'}</Text>
        <Text variant="secondary" color={colors.ink55}>USB powered</Text>
        <Text variant="secondarySm" color={colors.ink55} style={{ marginTop: space.s8 }}>Pair only with your trusted nearby pad.</Text>
      </SheetCard>
      {pad.link.error ? <Text variant="secondary" color={colors.down}>{pad.link.error}</Text> : null}
      <View>
        <Button label={pad.link.state === 'connected' ? 'Disconnect pad' : 'Pair pad'} loading={['scanning','connecting'].includes(pad.link.state)} onPress={pad.link.state === 'connected' ? pad.disconnect : pad.pair} />
      </View>
    </ScrollView>
  </Screen>;
}
