"use client";

import { useState } from "react";
import { BlurWords } from "@/components/motion/BlurWords";
import { Reveal } from "@/components/motion/Reveal";
import { Card } from "@/components/ui/Card";
import { PreorderCheckout } from "./PreorderCheckout";
import {
  PAD_BUILDS,
  PAD_BUILD_IDS,
  PAD_MODELS,
  PAD_PRICE_NOTE,
  PAD_SKUS,
  formatPadUsd,
  getPadPrice,
  type PadBuild,
  type PadSku,
} from "@/lib/pad-pricing";

const COMPARISON = [
  { label: "Display", value: (sku: PadSku) => PAD_MODELS[sku].display },
  { label: "Mic + speaker", value: (sku: PadSku) => PAD_MODELS[sku].audio },
  { label: "Knob", value: (sku: PadSku) => PAD_MODELS[sku].knob ? "Yes" : "No" },
  { label: "Keys", value: (sku: PadSku) => PAD_MODELS[sku].keys },
  { label: "On-pad signing", value: (sku: PadSku) => PAD_MODELS[sku].onPadSigning ? "Yes" : "No" },
];

/** Extends the existing teaser with the site's cards, type, palette and reveal motion. */
export function PadModels() {
  const [selection, setSelection] = useState<{ sku: PadSku; build: PadBuild }>({ sku: "pro", build: "assembled" });
  const model = PAD_MODELS[selection.sku];
  const build = PAD_BUILDS[selection.build];

  return (
    <section id="models" aria-labelledby="pad-models" className="relative mx-auto max-w-6xl scroll-mt-12 px-3 pb-20 sm:px-8 md:pb-28">
      <h2 id="pad-models" className="text-balance text-center font-display text-[clamp(2.25rem,4.4vw,3.75rem)] font-medium leading-[1.04] tracking-[-0.04em]">
        <BlurWords text="Choose your pad" />
      </h2>
      <Reveal>
        <p className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-ink/60">
          A screen on the pad, or the screens you already use. Put it together yourself, or let us build it for you.
        </p>
      </Reveal>

      <Card className="mt-9 p-5 sm:p-7 md:p-9">
        <fieldset>
          <legend className="mb-5 text-[15px] font-medium">Choose a model and build</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {PAD_SKUS.flatMap((sku) => PAD_BUILD_IDS.map((buildId) => {
              const selected = selection.sku === sku && selection.build === buildId;
              return (
                <label key={`${sku}-${buildId}`} className={`relative cursor-pointer rounded-2xl border p-5 transition-colors duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-lime ${selected ? "border-lime/60 bg-lime/[0.05]" : "border-white/10 bg-white/[0.025] hover:border-white/25"}`}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-display text-[20px] font-medium tracking-[-0.025em]">{PAD_MODELS[sku].name}</span>
                    <input
                      type="radio"
                      name="pad-configuration"
                      value={`${sku}-${buildId}`}
                      checked={selected}
                      onChange={() => setSelection({ sku, build: buildId })}
                      aria-label={`${PAD_MODELS[sku].name}, ${PAD_BUILDS[buildId].name}`}
                      className="size-4 shrink-0 accent-lime"
                    />
                  </span>
                  <span className="mt-2 block text-[14px] text-ink/70">{PAD_BUILDS[buildId].name}</span>
                  <span className="mt-5 block text-[25px] font-medium tabular-nums">{formatPadUsd(getPadPrice(sku, buildId))}</span>
                  <span className="mt-1 block text-[13px] text-lime">Founder {formatPadUsd(getPadPrice(sku, buildId, "founder"))}</span>
                </label>
              );
            }))}
          </div>
        </fieldset>

        <div aria-live="polite" aria-atomic="true" className="mt-7 border-t border-white/10 pt-6">
          <h3 className="font-display text-[20px] font-medium tracking-[-0.025em]">{model.name} · {build.name}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/70">{model.description}</p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink/70">{build.description}</p>
          {selection.build === "diy" && (
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink/70">In the kit: {PAD_BUILDS.diy.contents}</p>
          )}
          <p className="mt-4 text-[14px] tabular-nums text-ink/70">
            {formatPadUsd(model.deposit)} refundable deposit.
          </p>
        </div>
        <PreorderCheckout sku={selection.sku} build={selection.build} deposit={model.deposit} />
        <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-ink/60">{PAD_PRICE_NOTE}</p>
      </Card>

      <Reveal className="mt-10 px-2 sm:px-0">
        <table className="w-full table-fixed border-collapse text-left text-[13px] leading-relaxed sm:text-[15px]">
          <caption className="pb-5 text-left font-display text-[22px] font-medium tracking-[-0.025em] text-ink">Compare the pads</caption>
          <thead>
            <tr className="border-b border-white/15">
              <th scope="col" className="w-[32%] pb-4 pr-3 font-medium text-ink/70">Feature</th>
              {PAD_SKUS.map((sku) => <th key={sku} scope="col" className="px-2 pb-4 font-medium">{PAD_MODELS[sku].name}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label} className="border-b border-white/10">
                <th scope="row" className="py-4 pr-3 font-normal text-ink/70">{row.label}</th>
                {PAD_SKUS.map((sku) => <td key={sku} className="px-2 py-4 align-top text-ink/85">{row.value(sku)}</td>)}
              </tr>
            ))}
            {PAD_BUILD_IDS.map((buildId) => (
              <tr key={buildId} className="border-b border-white/10">
                <th scope="row" className="py-4 pr-3 font-normal text-ink/70">{PAD_BUILDS[buildId].name}</th>
                {PAD_SKUS.map((sku) => (
                  <td key={sku} className="px-2 py-4 align-top tabular-nums">
                    {formatPadUsd(getPadPrice(sku, buildId))}
                    <span className="mt-1 block text-[12px] text-lime sm:text-[13px]">Founder {formatPadUsd(getPadPrice(sku, buildId, "founder"))}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </section>
  );
}
