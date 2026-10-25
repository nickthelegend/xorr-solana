import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { BlurWords } from "@/components/motion/BlurWords";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { HIRING_TELEGRAM } from "@/lib/links";

export const metadata: Metadata = {
  title: "We're hiring — xorr",
  description:
    "xorr builds AI agents that trade tokenized US stocks and perps on Solana. We're hiring engineers, a designer and a growth lead. Send your resume on Telegram.",
  alternates: { canonical: "/hiring" },
};

const ROLES = [
  {
    title: "Founding Engineer, Solana",
    tags: ["Rust", "Anchor", "Jupiter"],
    body: "On-chain permissions, agent wallets, perps, swaps through Jupiter and the pre-IPO pools. You have shipped a program to mainnet.",
  },
  {
    title: "Full-stack Engineer",
    tags: ["TypeScript", "React Native", "Postgres"],
    body: "The Expo app on iOS, Android and the web, and the executor behind it: Hono, Postgres and the scheduler that runs every trade.",
  },
  {
    title: "AI Agents Engineer",
    tags: ["LLMs", "Backtesting", "Risk"],
    body: "The agents themselves: what they watch, why they take a trade, and the rules that stop them. Explaining every decision is part of the job.",
  },
  {
    title: "Product Designer",
    tags: ["Mobile", "Motion", "Trading UI"],
    body: "Make a trading app feel calm. Screens, motion and the moments that build trust, from the first deposit to the one-tap stop.",
  },
  {
    title: "Growth & Community",
    tags: ["Solana", "Content", "Partnerships"],
    body: "Bring the first thousand traders in and keep them. Content, the Solana ecosystem, and partners who list with us.",
  },
];

/** A Telegram chat with the founder, with the message started for them. */
function applyLink(role?: string) {
  const text = role
    ? `Hi! I'd like to apply to xorr for the ${role} role. Here's my resume and links:`
    : "Hi! I'd like to work on xorr. Here's my resume and links:";
  return `https://t.me/${HIRING_TELEGRAM}?text=${encodeURIComponent(text)}`;
}

export default function Hiring() {
  return (
    <main className="pb-3">
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[32px] border border-white/[0.06] bg-[#060608] sm:mx-3 sm:mt-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(85%_45%_at_50%_-8%,rgba(47,91,255,0.45)_0%,rgba(28,52,180,0.16)_45%,transparent_75%),radial-gradient(40%_30%_at_90%_8%,rgba(200,245,60,0.12),transparent_70%)]"
        />
        <div aria-hidden className="noise pointer-events-none absolute inset-0" />

        <header className="relative z-10 flex items-center justify-between px-6 pt-7 sm:px-10">
          <Link href="/" aria-label="xorr home">
            <Image src="/brand/xorr-wordmark.png" alt="xorr" width={841} height={182} className="h-[14px] w-auto" />
          </Link>
          <Link href="/" className="text-[13px] text-ink/55 transition-colors duration-200 hover:text-ink">
            Back to xorr
          </Link>
        </header>

        <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pb-16 pt-20 text-center md:pt-28">
          <Reveal immediate>
            <Badge icon="users">We&apos;re hiring</Badge>
          </Reveal>
          <h1 className="mt-6 max-w-4xl text-balance font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-medium leading-[1.03] tracking-[-0.045em]">
            <BlurWords immediate delay={0.2} text="Build the bot that trades while the market sleeps" />
          </h1>
          <Reveal immediate delay={0.7}>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink/60">
              xorr runs AI agents that trade tokenized US stocks and perps on Solana, each from its own wallet and inside
              rules the owner sets. We won the Stocklana hackathon and we&apos;re still building: a small team that wants a few
              more people who ship.
            </p>
          </Reveal>
          <Reveal immediate delay={0.9} className="mt-9">
            <a
              href={applyLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-[52px] items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-[#07080a] shadow-[0_20px_50px_-20px_rgba(200,245,60,0.6)] transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.97]"
            >
              Send your resume on Telegram
              <Icon name="arrowUpRight" className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
            </a>
          </Reveal>
          <Reveal immediate delay={1.05}>
            <p className="mt-4 text-[13px] text-ink/45">
              Message <span className="text-ink/75">@{HIRING_TELEGRAM}</span> on Telegram with your resume, GitHub or portfolio,
              and one thing you shipped that you are proud of.
            </p>
          </Reveal>
        </section>

        <section className="relative z-10 mx-auto max-w-5xl px-4 pb-24 sm:px-8">
          <h2 className="mb-6 px-2 text-[12px] font-medium uppercase tracking-[0.16em] text-ink/45">Open roles</h2>
          <ul className="grid gap-3">
            {ROLES.map((r, i) => (
              <Reveal key={r.title} delay={i * 0.06} y={18}>
                <li>
                  <a
                    href={applyLink(r.title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-6 transition-[border-color,background-color] duration-200 hover:border-white/20 hover:bg-white/[0.06] md:flex-row md:items-center md:justify-between md:p-7"
                  >
                    <div className="max-w-2xl">
                      <h3 className="font-display text-[clamp(1.25rem,2vw,1.5rem)] font-medium tracking-[-0.02em] text-ink">{r.title}</h3>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-ink/55">{r.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-ink/65">
                            {t}
                          </span>
                        ))}
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-ink/65">Remote</span>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] text-ink/80 transition-colors duration-200 group-hover:bg-ink group-hover:text-[#07080a] md:self-center">
                      Apply
                      <Icon name="arrowUpRight" className="size-3.5" strokeWidth={2} />
                    </span>
                  </a>
                </li>
              </Reveal>
            ))}
          </ul>

          <Reveal y={18} className="mt-10">
            <div className="rounded-[24px] border border-lime/20 bg-[linear-gradient(150deg,rgba(200,245,60,0.08),rgba(13,216,126,0.03))] p-6 text-center md:p-8">
              <p className="font-display text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">Not on the list?</p>
              <p className="mx-auto mt-2 max-w-lg text-[14.5px] leading-relaxed text-ink/60">
                If you can make xorr better, write anyway: send your resume and links on Telegram.
              </p>
              <a
                href={applyLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-[#07080a] transition-colors duration-200 hover:bg-white"
              >
                Message us on Telegram
                <Icon name="arrowUpRight" className="size-4" strokeWidth={2} />
              </a>
            </div>
          </Reveal>
        </section>
      </div>
    </main>
  );
}
