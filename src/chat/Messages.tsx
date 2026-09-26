/**
 * Messages — the agents, listed as a messenger lists its chats (2026-09-15).
 *
 * Opened from the tab bar's Messages button, in the drawer that rises from the bottom (`ChatSheet`), and drawn to the
 * product owner's reference: you at the top left, search and add at the top right, the agents across the top as large
 * orbs, then one row per conversation — the agent, its last line, when, and a mark when something in it is new. A row
 * or an orb opens that agent's conversation in the same drawer. Your profile opens as its own screen, and the drawer comes
 * back up on this list when you return from it.
 *
 * Nothing here is written for the screen. The rows are the thread (`conversations.ts`); who is added comes from the
 * executor's `/agents`, and the + makes an agent of your own (`app/agent/new.tsx`), which joins the four here.
 *
 * Hired or not, said on every agent (2026-09-25). The list is the whole roster, so an agent you never hired can still be
 * asked a question — but every row was drawn alike, and someone who had hired nobody read four live conversations and
 * asked why agents they never made had popped up. Now the roster's own `hired` flag decides how each is drawn: a hired
 * agent carries a green "Hired" tag in the list and a green ring across the top, and leads both; one you have not hired
 * is drawn quieter, with a "Not hired" tag. Until the roster has answered nothing is marked either way, rather than
 * every agent flashing "Not hired" on the way in.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import type { Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/design/Icon';
import { agentGradient } from '@/design/gradients';
import { AgentOrb, Press, Tag, Text, alpha, radius, signIn, space } from '@/ui';
import { repos } from '@/data';
import { useAsync } from '@/data/useAsync';
import { usePrivyIdentity } from '@/auth/usePrivyIdentity';
import { useSignedOut } from '@/auth/useSignedOut';
import { useStore } from '@/state/store';
import { useNow } from '@/state/useNow';
import { useThread } from '@/bot/thread';
import type { ThreadMessage } from '@/bot/message';
import { useChatAgents, useMadeAgents, type ChatAgent } from './agents';
import { hiredFirst, listTime, searchMessages, summaries, type ConversationSummary } from './conversations';
import { GLASS, GlassButton } from './parts';
import { useChatRoom, useChatTheme } from './chatTheme';
import { chat, chatShadow, chatType } from './theme';

const AVATAR = GLASS;
const ORB = 56 as const;
const ORB_TILE = 84;
/**
 * The narrowest an orb's tile gets so the whole row fits on screen (2026-09-25): the ringed orb, and a name on two lines.
 *
 * At 84 the four agents and "New agent" are 444pt on a 402pt phone, so the row came to rest with the last tile cut
 * through its middle — "New ag". Where every tile fits at this width or wider they share the row instead; only a row
 * too long for that (agents of your own added) scrolls, and it ends on the same padding it starts with.
 */
const ORB_TILE_MIN = 70;
/** The hired ring around an orb across the top, and the gap between it and the orb. */
const RING = 2;
const RING_GAP = 2;
const RINGED = ORB + 2 * (RING + RING_GAP);
/** How far an agent you have not hired recedes: still legible, plainly not one working for you. */
const NOT_HIRED_OPACITY = 0.45;
/**
 * A row's orb — a conversation, a search result, an agent to add: the smallest size the orb is drawn at. The same face
 * in every list, so an agent is one character wherever it appears.
 */
const ROW_ORB = 52 as const;
const DOT = 11;
const PILL_H = 32;
/** A browser draws its own focus ring inside the field; the glass pill is the focus here. */
const NO_WEB_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

type Mode = 'list' | 'search';

export interface MessagesProps {
  /** Lowers the drawer. */
  onClose: () => void;
  /** Opens one agent's conversation in the drawer. */
  onOpen: (agent: string) => void;
  /** Opens a screen over the one the drawer rose from, and brings the drawer back when it closes. */
  onOpenScreen: (href: Href) => void;
  /** Space under the list — the drawer's home-indicator inset. */
  footerInset: number;
}

export function Messages({ onClose, onOpen, onOpenScreen, footerInset }: MessagesProps) {
  const signedOut = useSignedOut();
  const { name } = usePrivyIdentity();
  const address = useStore((s) => s.wallet?.address);
  const messages = useThread((s) => s.messages);
  const read = useThread((s) => s.read);
  const now = useNow();
  const roster = useAsync(() => repos.bot.listAgents(), []);
  const agents = useChatAgents();
  const remember = useMadeAgents((s) => s.remember);
  const [mode, setMode] = useState<Mode>('list');
  /*
   * The room showing, and whether the phone is the one deciding it. The button names the room it would move to, and
   * says when it is taking over from the phone — a control that silently overrides an OS setting is how someone ends up
   * wondering why one app stopped following dusk.
   */
  const { room, following } = useChatRoom();
  const pickRoom = useChatTheme((s) => s.pick);
  const [query, setQuery] = useState('');
  /** The orb row's own width — the drawer's, which on a wide browser is not the window's. */
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    if (roster.data) remember(roster.data);
  }, [roster.data, remember]);

  const names = useMemo(() => agents.map((a) => a.name), [agents]);
  const added = useMemo(
    () => new Set((roster.data ?? []).filter((a) => a.hired).map((a) => a.name)),
    [roster.data],
  );
  // Hired agents first, in the list and across the top: they are the ones allowed to act for you.
  const list = useMemo(
    () => hiredFirst(summaries(messages, names, read), (s) => added.has(s.agent)),
    [messages, names, read, added],
  );
  const featured = useMemo(() => hiredFirst(agents, (a) => added.has(a.name)), [agents, added]);
  /** Hired, not hired — or not known yet, while the roster is on its way or could not be read. */
  const hiredOf = (agent: string): boolean | undefined => (roster.data ? added.has(agent) : undefined);
  const tile = tileWidth(rowWidth, featured.length + 1);
  const initial = (name?.replace(/^@/, '') ?? address?.replace(/^0x/i, '') ?? '').charAt(0).toUpperCase();

  /* The drawer goes down first, so the screen it opens is not underneath it. */
  const goSignIn = () => {
    onClose();
    signIn();
  };
  // And for your profile it comes back up on this list when you return (`useChatDrawer.leave`).
  const openProfile = () => onOpenScreen('/profile');
  // Making one opens as its own screen too, and lands on the new agent's page.
  const makeAgent = () => onOpenScreen('/agent/new');

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[chat.groundTop, chat.groundMid, chat.groundBottom]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {mode === 'search' ? (
        <SearchHeader
          query={query}
          onChange={setQuery}
          onCancel={() => {
            setQuery('');
            setMode('list');
          }}
        />
      ) : (
        <View style={HEADER}>
          <Press
            onPress={signedOut ? goSignIn : openProfile}
            accessibilityRole="button"
            accessibilityLabel={signedOut ? 'Sign in' : 'Your profile'}
            hitWidth={44}
            hitHeight={44}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: chat.heading,
              boxShadow: chatShadow,
            }}
          >
            {initial ? (
              <Text color={chat.onHeading} style={chatType.title}>
                {initial}
              </Text>
            ) : null}
          </Press>
          <View style={{ flex: 1 }} />
          <GlassButton
            icon={room === 'black' ? 'sun' : 'moon'}
            label={`${room === 'black' ? 'Use the light theme' : 'Use the black theme'}${
              following ? '. Messages currently follows your phone' : ''
            }`}
            onPress={() => pickRoom(room)}
          />
          <GlassButton icon="search" label="Search agents and messages" onPress={() => setMode('search')} />
          <GlassButton icon="plus" label="Make an agent" onPress={signedOut ? goSignIn : makeAgent} />
        </View>
      )}

      <ScrollView
        // Clipped at its own top edge, so a scrolled list never slides under the header's controls.
        style={{ flex: 1, overflow: 'hidden' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: footerInset + space.s12 }}
      >
        {mode === 'search' ? (
          <SearchResults query={query} agents={agents} messages={messages} now={now} onOpen={onOpen} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
              contentContainerStyle={{ paddingHorizontal: space.s12, paddingTop: space.s14, paddingBottom: space.s18 }}
            >
              {featured.map((agent) => {
                const hired = hiredOf(agent.name);
                return (
                  <Press
                    key={agent.id}
                    onPress={() => onOpen(agent.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${agent.name}${hireWords(hired)}. Open the conversation`}
                    style={{ width: tile, alignItems: 'center', gap: space.s6 }}
                  >
                    {/* The ring the list's "Hired" tag stands for; every orb sits in the same box, so the row stays level. */}
                    <View style={[RING_BOX, { borderColor: hired ? chat.up : 'transparent' }]}>
                      <AgentOrb
                        gradient={agentGradient(agent.name)}
                        size={ORB}
                        face
                        identity={agent.name}
                        style={hired === false ? { opacity: NOT_HIRED_OPACITY } : undefined}
                      />
                    </View>
                    <Text
                      color={hired === false ? chat.muted : chat.inkSoft}
                      style={chatType.small}
                      align="center"
                      numberOfLines={2}
                    >
                      {agent.name}
                    </Text>
                  </Press>
                );
              })}
              {/* The last orb makes a new one, where the agents are. */}
              <Press
                onPress={signedOut ? goSignIn : makeAgent}
                accessibilityRole="button"
                accessibilityLabel="New agent. Make one of your own"
                style={{ width: tile, alignItems: 'center', gap: space.s6 }}
              >
                <View style={[RING_BOX, { borderColor: 'transparent' }]}>
                  <View
                    style={{
                      width: ORB,
                      height: ORB,
                      borderRadius: ORB / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: chat.glass,
                      borderWidth: 1,
                      borderColor: chat.glassBorder,
                    }}
                  >
                    <Icon name="plus" size={22} color={chat.accentDeep} strokeWidth={2.2} />
                  </View>
                </View>
                <Text color={chat.inkSoft} style={chatType.small} align="center" numberOfLines={2}>
                  New agent
                </Text>
              </Press>
            </ScrollView>

            {signedOut ? (
              <SignInCard text="Sign in to talk to your agents." onPress={goSignIn} />
            ) : (
              list.map((summary) => (
                <ConversationRow
                  key={summary.agent}
                  summary={summary}
                  role={roleOf(agents, summary.agent)}
                  hired={hiredOf(summary.agent)}
                  now={now}
                  onPress={() => onOpen(summary.agent)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const HEADER = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.s10,
  minHeight: GLASS,
  paddingHorizontal: space.gutter,
  paddingBottom: space.s6,
} as const;

/** The box every orb across the top sits in: a hired one's ring shows, anyone else's is transparent. */
const RING_BOX = {
  width: RINGED,
  height: RINGED,
  borderRadius: RINGED / 2,
  borderWidth: RING,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/**
 * How wide each tile across the top is. The full 84 where the row has room for it; shared evenly where every tile fits
 * at `ORB_TILE_MIN` or wider, so the last one is never cut through its name; 84 again, scrolling, where even that is too
 * wide. Before the row has been measured, 84.
 */
function tileWidth(rowWidth: number, count: number): number {
  const room = rowWidth - 2 * space.s12;
  if (rowWidth <= 0 || count * ORB_TILE <= room || count * ORB_TILE_MIN > room) return ORB_TILE;
  return Math.floor(room / count);
}

/** What a screen reader hears after an agent's name, where the roster has said. */
function hireWords(hired: boolean | undefined): string {
  return hired === undefined ? '' : hired ? ', hired' : ', not hired';
}

/**
 * Hired or not, in words beside the name. Green is the roster's own colour for "Hired" (`hiredBg` in the tokens) — a
 * state, never a P&L reading — in the room's green so it holds on white and on black; "Not hired" asks for nothing.
 */
function HireTag({ hired }: { hired: boolean }) {
  return (
    <Tag
      label={hired ? 'Hired' : 'Not hired'}
      small
      radius={radius.full}
      colors={hired ? { bg: alpha(chat.up, 0.14), fg: chat.up } : { bg: chat.glass, fg: chat.muted }}
      style={{ alignSelf: 'center', flexShrink: 0 }}
    />
  );
}

function roleOf(agents: readonly ChatAgent[], name: string): string {
  return agents.find((a) => a.name === name)?.role ?? '';
}

/**
 * One conversation: the agent, its last line, when it moved, and a mark when something in it is new — and whether it
 * is hired, as a tag by the name; one you have not hired is drawn quieter. Unmarked while that is not known.
 */
function ConversationRow({
  summary,
  role,
  hired,
  now,
  onPress,
}: {
  summary: ConversationSummary;
  role: string;
  hired?: boolean;
  now: number;
  onPress: () => void;
}) {
  const { agent, last, unread } = summary;
  const line = last ? (last.fromYou ? `You: ${last.text}` : last.text) : role;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${agent}${hireWords(hired)}${unread > 0 ? `, ${unread} new` : ''}. ${line}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, paddingLeft: space.gutter }}
    >
      <View>
        {/*
          The same face as the orb across the top, smaller: an agent is one character wherever it appears. Only the orb
          recedes for one not hired — the new-message dot beside it keeps its full colour.
        */}
        <AgentOrb
          gradient={agentGradient(agent)}
          size={ROW_ORB}
          face
          identity={agent}
          style={hired === false ? { opacity: NOT_HIRED_OPACITY } : undefined}
        />
        {unread > 0 ? (
          <View
            style={{
              position: 'absolute',
              left: -1,
              bottom: 1,
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: chat.accentDeep,
              borderWidth: 2,
              borderColor: chat.groundMid,
            }}
          />
        ) : null}
      </View>
      <View
        style={{
          flex: 1,
          paddingVertical: space.s12,
          paddingRight: space.gutter,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: chat.hairline,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
          <Text
            color={hired === false ? chat.inkSoft : chat.ink}
            style={[chatType.rowTitle, { flexShrink: 1 }]}
            numberOfLines={1}
          >
            {agent}
          </Text>
          {hired !== undefined ? <HireTag hired={hired} /> : null}
          <View style={{ flex: 1 }} />
          {last ? (
            <Text color={unread > 0 ? chat.accentDeep : chat.muted} style={chatType.small}>
              {listTime(last.at, now)}
            </Text>
          ) : null}
        </View>
        <Text color={chat.muted} style={[chatType.body, { marginTop: space.s2 }]} numberOfLines={1}>
          {line}
        </Text>
      </View>
    </Press>
  );
}

function SearchHeader({
  query,
  onChange,
  onCancel,
}: {
  query: string;
  onChange: (text: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={HEADER}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s8,
          height: GLASS,
          borderRadius: GLASS / 2,
          paddingHorizontal: space.s14,
          backgroundColor: chat.glass,
          borderWidth: 1,
          borderColor: chat.glassBorder,
        }}
      >
        <Icon name="search" size={16} color={chat.muted} strokeWidth={2.1} />
        <TextInput
          value={query}
          onChangeText={onChange}
          autoFocus
          placeholder="Search"
          placeholderTextColor={chat.faint}
          accessibilityLabel="Search agents and messages"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[chatType.input, { flex: 1, color: chat.ink, paddingVertical: 0 }, NO_WEB_OUTLINE]}
        />
      </View>
      <Press onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel search" hitHeight={44}>
        <Text color={chat.accentDeep} style={chatType.button}>
          Cancel
        </Text>
      </Press>
    </View>
  );
}

/** Agents by name or mandate, and what was said by its words — each a way into that agent's conversation. */
function SearchResults({
  query,
  agents: all,
  messages,
  now,
  onOpen,
}: {
  query: string;
  agents: readonly ChatAgent[];
  messages: readonly ThreadMessage[];
  now: number;
  onOpen: (agent: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => searchMessages(messages, query).slice(0, 40), [messages, query]);
  const agents = q ? all.filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)) : all;

  if (q && agents.length === 0 && hits.length === 0) {
    return (
      <Text color={chat.muted} style={[chatType.body, { marginTop: space.s30 }]} align="center">
        {`Nothing matches “${query.trim()}”.`}
      </Text>
    );
  }

  return (
    <View style={{ paddingTop: space.s10 }}>
      <Section label="Agents" />
      {agents.map((a) => (
        <ResultRow key={a.id} agent={a.name} line={a.role} onPress={() => onOpen(a.name)} />
      ))}
      {hits.length > 0 ? (
        <>
          <Section label="Messages" />
          {hits.map((h) => (
            <ResultRow key={h.id} agent={h.agent} line={h.text} time={listTime(h.at, now)} onPress={() => onOpen(h.agent)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Section({ label }: { label: string }) {
  return (
    <Text
      color={chat.muted}
      style={[chatType.label, { paddingHorizontal: space.gutter, paddingTop: space.s12, paddingBottom: space.s4 }]}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function ResultRow({ agent, line, time, onPress }: { agent: string; line: string; time?: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${agent}. ${line}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12, paddingHorizontal: space.gutter, paddingVertical: space.s10 }}
    >
      <AgentOrb gradient={agentGradient(agent)} size={ROW_ORB} face identity={agent} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s8 }}>
          <Text color={chat.ink} style={[chatType.rowTitle, { flex: 1 }]} numberOfLines={1}>
            {agent}
          </Text>
          {time ? (
            <Text color={chat.muted} style={chatType.small}>
              {time}
            </Text>
          ) : null}
        </View>
        <Text color={chat.muted} style={chatType.body} numberOfLines={2}>
          {line}
        </Text>
      </View>
    </Press>
  );
}

function SignInCard({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <View
      style={{
        marginHorizontal: space.gutter,
        marginTop: space.s6,
        padding: space.s18,
        borderRadius: 22,
        alignItems: 'center',
        gap: space.s12,
        backgroundColor: chat.card,
        borderWidth: 1,
        borderColor: chat.cardBorder,
        boxShadow: chatShadow,
      }}
    >
      <Text color={chat.inkSoft} style={chatType.body} align="center">
        {text}
      </Text>
      <PrimaryPill label="Sign in" onPress={onPress} />
    </View>
  );
}

function PrimaryPill({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      hitHeight={44}
      style={{
        height: PILL_H,
        paddingHorizontal: space.s16,
        borderRadius: PILL_H / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <LinearGradient
        colors={[chat.primaryTop, chat.primaryBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Above the gradient: on web an absolute layer paints over its in-flow siblings. */}
      <View style={{ zIndex: 1 }}>
        <Text color="#FFFFFF" style={chatType.chip}>
          {label}
        </Text>
      </View>
    </Press>
  );
}
