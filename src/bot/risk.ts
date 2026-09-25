/**
 * The agent's risk profile, as the app talks about it.
 *
 * The thresholds themselves are NOT duplicated here. They come down with the options from
 * `/agents/risk-profile`, because a screen carrying its own copy of the table would drift from the
 * agent the first time one moved — and the drift would surface as a screen confidently describing
 * behaviour the agent no longer has. This file holds only the shapes and the wording.
 */

export const RISK_PROFILES = ['conservative', 'balanced', 'aggressive'] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];

export type RiskSettings = {
  maxTradeUsd: number;
  minTradeUsd: number;
  allowanceShare: number;
  momentumEntryAt: number;
  dcaEntryBelow: number;
  minObservations: number;
  corporateActionWindowHours: number;
  earningsErrorToleranceDays: number;
  cooldownMinutes: number;
};

export type RiskOption = { profile: RiskProfile; blurb: string; settings: RiskSettings };

export type RiskProfileState = {
  active: RiskProfile;
  settings: RiskSettings;
  options: RiskOption[];
};

export const PROFILE_TITLE: Readonly<Record<RiskProfile, string>> = Object.freeze({
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
});

/**
 * The differences between profiles, as rows a person can compare.
 *
 * Every line is derived from the settings the server sent, so this cannot describe a threshold the
 * agent is not actually using. The wording says which direction is which, because "96 hours" means
 * nothing without "clear of", and a reader should not have to work out whether larger is safer.
 */
export function settingLines(s: RiskSettings): { label: string; value: string }[] {
  return [
    { label: 'Largest entry', value: `$${s.maxTradeUsd}` },
    { label: 'Of what is left today', value: `up to ${Math.round(s.allowanceShare * 100)}%` },
    {
      label: 'Counts as a breakout',
      value: `${Math.round(s.momentumEntryAt * 100)}th percentile and above`,
    },
    { label: 'Counts as a dip', value: `below the ${Math.round(s.dcaEntryBelow * 100)}th` },
    { label: 'Readings before a band counts', value: `${s.minObservations}` },
    {
      label: 'Clear of a split or dividend',
      value: `${s.corporateActionWindowHours} hours`,
    },
    {
      label: 'Earnings date must be pinned to',
      value: `${s.earningsErrorToleranceDays} ${s.earningsErrorToleranceDays === 1 ? 'day' : 'days'}`,
    },
    { label: 'Between entries', value: `${s.cooldownMinutes} minutes` },
  ];
}

/**
 * What changes if this profile is chosen, against the one in force.
 *
 * Only the lines that differ. A list of eight rows where six are identical makes the reader do the
 * comparison the screen exists to do for them, and buries the two that matter.
 */
export function differences(
  from: RiskSettings,
  to: RiskSettings,
): { label: string; before: string; after: string }[] {
  const a = settingLines(from);
  const b = settingLines(to);
  return b
    .map((line, i) => ({ label: line.label, before: a[i]?.value ?? '', after: line.value }))
    .filter((d) => d.before !== d.after);
}

/**
 * A change as one short phrase, with the words both sides share said once (2026-09-25).
 *
 * "75th percentile and above → 65th percentile and above" is wider than a phone, and as a row's value it pushed the
 * setting's own name off the screen and was cut off itself. The shared words are not the change — the numbers are — so
 * they are said once around it: "75th → 65th", then "percentile and above". Whole words only, so "$25" and "$50" share
 * nothing rather than a "$", and "1 day" and "3 days" stay whole; each side always keeps at least one word of its own.
 */
export function changePhrase(
  before: string,
  after: string,
): { lead: string; before: string; after: string; tail: string } {
  const a = before.split(' ');
  const b = after.split(' ');
  let lead = 0;
  while (lead < a.length - 1 && lead < b.length - 1 && a[lead] === b[lead]) lead++;
  let tail = 0;
  while (
    tail < a.length - 1 - lead &&
    tail < b.length - 1 - lead &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  return {
    lead: a.slice(0, lead).join(' '),
    before: a.slice(lead, a.length - tail).join(' '),
    after: b.slice(lead, b.length - tail).join(' '),
    tail: a.slice(a.length - tail).join(' '),
  };
}
