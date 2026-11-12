import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SmoothScroll } from "@/components/SmoothScroll";
import { XorrMark } from "@/components/XorrMark";
import { KeysStack } from "@/components/bento/KeysStack";
import { RuleTracks } from "@/components/bento/RuleTracks";
import { BlurWords } from "@/components/motion/BlurWords";
import { Reveal } from "@/components/motion/Reveal";
import { Footer } from "@/components/sections/Footer";
import { Arc, Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Waitlist } from "@/components/waitlist/Waitlist";

export const metadata: Metadata = {
  title: "xorrpad — Every market. One desk. Fourteen keys.",
  description: "The physical side of xorr. Fourteen keys, a voice agent and your rules, connected through XOR Desktop. Coming soon.",
  alternates: { canonical: "/pad" },
  openGraph: {
    title: "xorrpad · coming soon",
    description: "Every market. One desk. Fourteen keys.",
    url: "/pad",
  },
};

const VENUES = ["Jupiter", "Meteora", "Phoenix", "Jupiter Perps", "pm-AMM"];

/** An extension of the home page's visual world; no global styles or shared motion change. */
export default function Pad() {
  return (
    <main className="pb-3">
      <SmoothScroll />
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[32px] border border-white/[0.06] bg-[#060608] sm:mx-3 sm:mt-3">
        <section className="relative isolate overflow-hidden px-6 pb-20 sm:px-8 md:pb-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(85%_60%_at_50%_-8%,rgba(47,91,255,0.5)_0%,rgba(28,52,180,0.2)_42%,transparent_72%),radial-gradient(40%_36%_at_90%_10%,rgba(183,166,255,0.13),transparent_70%)]"
          />
          <div aria-hidden className="noise pointer-events-none absolute inset-0" />
          <header className="relative z-10 flex items-center justify-between pt-7 sm:px-2">
            <Link href="/" aria-label="xorr home">
              <Image src="/brand/xorr-wordmark.png" alt="xorr" width={841} height={182} loading="eager" className="h-[14px] w-auto" />
            </Link>
            <a href="#waitlist" className="text-[13px] text-ink/55 transition-colors duration-200 hover:text-ink">
              Get in line
            </a>
          </header>

          <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center pt-20 text-center md:pt-24">
            <Reveal immediate delay={0.15}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 py-1 pl-1 pr-3.5 text-[12.5px] text-ink/90 backdrop-blur-md">
                <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-[#0c1003]">New</span>
                xorrpad · coming soon
              </span>
            </Reveal>
            <h1 className="mt-6 text-balance font-display text-[clamp(2.6rem,6vw,5.4rem)] font-medium leading-[1.02] tracking-[-0.045em] text-ink">
              <BlurWords immediate delay={0.3} text={"Every market. One desk.\nFourteen keys."} />
            </h1>
            <Reveal immediate delay={0.8}>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink/60">
                The physical side of xorr. A pad, your desktop and your phone wallet, built to work together.
              </p>
            </Reveal>
            <Reveal immediate delay={1} className="relative mt-12 w-[min(100%,288px)]">
              <div aria-hidden className="pointer-events-none absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(circle,rgba(47,91,255,0.5),rgba(183,166,255,0.12)_45%,transparent_70%)] blur-2xl" />
              <div className="animate-float-slow motion-reduce:animate-none">
                <Image
                  src="/media/pad.webp"
                  alt="The real xorrpad prototype with fourteen keys and a display, in its blue enclosure on a workbench"
                  width={288}
                  height={340}
                  sizes="(max-width: 375px) calc(100vw - 66px), 288px"
                  loading="eager"
                  unoptimized
                  className="h-auto w-full rounded-[28px] border border-white/10"
                />
              </div>
            </Reveal>
          </div>
        </section>

        <section aria-label="What xorrpad brings to your desk" className="relative px-3 pb-20 sm:px-8 md:pb-28">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            <Card className="flex min-h-[400px] flex-col p-7 md:p-8">
              <Arc className="-left-44 top-[30%]" />
              <div aria-hidden className="relative flex flex-1 items-center justify-center py-6">
                <KeysStack />
              </div>
              <h2 className="relative font-display text-[clamp(1.4rem,2.2vw,1.75rem)] font-medium tracking-[-0.025em]">Press to trade</h2>
              <p className="relative mt-2 text-[15px] leading-relaxed text-ink/55">
                Fourteen keys for your markets and actions. Customize your shortcuts on the desk, then put them within reach.
              </p>
            </Card>
            <Card delay={0.1} className="flex min-h-[400px] flex-col p-7 md:p-8">
              <Arc className="-right-44 top-[30%]" />
              <div aria-hidden className="relative flex flex-1 items-center justify-center py-10">
                <div className="grid size-[92px] animate-float place-items-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_28%,#3b3b44_0%,#16161b_48%,#050506_100%)] text-lavender shadow-[0_28px_50px_-14px_rgba(0,0,0,0.95),inset_0_1px_1px_rgba(255,255,255,0.28)] motion-reduce:animate-none">
                  <Icon name="wave" className="size-10" />
                </div>
              </div>
              <h2 className="relative font-display text-[clamp(1.4rem,2.2vw,1.75rem)] font-medium tracking-[-0.025em]">Talk to it</h2>
              <p className="relative mt-2 text-[15px] leading-relaxed text-ink/55">
                Hold the mic key and talk to your slang-speaking agent. Say what you want to do. Your rules still apply.
              </p>
            </Card>
            <Card delay={0.2} className="flex min-h-[400px] flex-col">
              <div aria-hidden className="flex flex-1 items-center">
                <RuleTracks className="w-full" />
              </div>
              <div className="p-7 pt-0 md:p-8 md:pt-0">
                <h2 className="font-display text-[clamp(1.4rem,2.2vw,1.75rem)] font-medium tracking-[-0.025em]">You sign</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/55">
                  Every trade clears the gate and your caps. Sign with your phone wallet, or choose a session wallet with limits you set.
                </p>
              </div>
            </Card>
          </div>
        </section>

        <section aria-label="Venues" className="relative mx-auto max-w-6xl px-6 pb-20 text-center sm:px-8 md:pb-28">
          <Reveal>
            <p className="text-[13px] text-ink/45">Across Solana</p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 font-display text-[17px] font-medium text-ink/65 md:gap-x-12">
              {VENUES.map((venue) => <li key={venue}>{venue}</li>)}
            </ul>
          </Reveal>
        </section>

        <section aria-label="XOR Desktop" className="relative mx-auto max-w-6xl px-3 sm:px-8">
          <Card className="flex flex-col items-start gap-7 p-7 md:flex-row md:items-center md:justify-between md:p-9">
            <div className="flex items-center gap-5">
              <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
                <XorrMark dot={false} className="w-7 text-lime" />
              </span>
              <div>
                <h2 className="font-display text-[clamp(1.4rem,2.2vw,1.75rem)] font-medium tracking-[-0.025em]">XOR Desktop</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/55">Connect, customize and give your pad abilities.</p>
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col items-center gap-3 md:w-auto">
              <button type="button" disabled aria-describedby="desktop-coming-soon" className="inline-flex h-[52px] w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-6 text-[14px] font-medium text-ink/55 disabled:cursor-not-allowed md:w-auto">
                Download XOR Desktop
              </button>
              <p id="desktop-coming-soon" className="text-[13px] text-ink/55">Coming with the first pads</p>
            </div>
          </Card>
        </section>

        <section id="waitlist" className="relative scroll-mt-12 overflow-hidden px-4 pb-8 pt-28 sm:px-8 md:pt-36">
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
            <h2 className="text-balance font-display text-[clamp(2.25rem,4.8vw,4rem)] font-medium leading-[1.04] tracking-[-0.04em]">
              <BlurWords text="Make room on your desk" />
            </h2>
            <Reveal delay={0.2}>
              <p className="mt-4 text-[15px] text-ink/60">xorrpad is coming. Join the xorr waitlist.</p>
            </Reveal>
            <Reveal delay={0.35} className="mt-9 flex w-full justify-center">
              <Waitlist />
            </Reveal>
          </div>
          <Footer />
        </section>
      </div>
    </main>
  );
}
