// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi

export type PadSku = "core" | "pro";
export type PadBuild = "diy" | "assembled";
export type PadEdition = "standard" | "founder";

export const PAD_SKUS: readonly PadSku[] = ["core", "pro"];
export const PAD_BUILD_IDS: readonly PadBuild[] = ["diy", "assembled"];

export const PAD_BUILDS = {
  diy: {
    name: "DIY kit",
    description: "Press in the switches and caps, close the case, then flash from your browser. About 15 minutes, no soldering.",
    contents: "PCB with every surface-mount part already soldered and tested, hot-swap sockets, switches, printed caps, case, screws and a USB-C cable.",
  },
  assembled: {
    name: "Assembled & shipped",
    description: "Built, flashed, factory-tested and shipped to your address.",
  },
} as const;

// Assembled retail/founder prices: xorrpad/docs/business/PRICING.md and SUMMARY.md.
// ASSUMPTION for Nick to approve: DIY retail/founder prices ($79/$69 Core, $159/$139 Pro).
// Prices and deposits are USD. Deposits are per model, independent of build or edition.
export const PAD_MODELS = {
  core: {
    name: "xorrpad Core",
    description: "Your desktop and phone are its screen.",
    display: "Desktop + phone",
    audio: "Via desktop + phone",
    knob: true,
    keys: 14,
    onPadSigning: true,
    deposit: 20,
    prices: {
      diy: { standard: 79, founder: 69 },
      assembled: { standard: 99, founder: 89 },
    },
  },
  pro: {
    name: "xorrpad Pro",
    description: 'A 2.8" display, mic, speaker and knob on the pad.',
    display: '2.8" on-pad display',
    audio: "Built-in mic + speaker",
    knob: true,
    keys: 14,
    onPadSigning: true,
    deposit: 30,
    prices: {
      diy: { standard: 159, founder: 139 },
      assembled: { standard: 179, founder: 159 },
    },
  },
} as const;

export const PAD_PRICE_NOTE = "Prices in USD; taxes and shipping at checkout; ships after the pilot run, timeline TBD.";

export function getPadPrice(sku: PadSku, build: PadBuild, edition: PadEdition = "standard"): number {
  return PAD_MODELS[sku].prices[build][edition];
}

export function formatPadUsd(amount: number): string {
  return `$${amount}`;
}
