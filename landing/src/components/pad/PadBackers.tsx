// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PAD_BUILDS, PAD_MODELS } from '@/lib/pad-pricing';
import { verifiedBackers } from '@/lib/pad-backers';

export async function PadBackers({ strip = false }: { strip?: boolean }) {
  let result;
  try { result = await verifiedBackers(); } catch { /* Never turn a DB/RPC outage into zero backers. */ }
  return (
    <section id="backers" aria-labelledby="pad-backers" className="relative mx-auto max-w-6xl px-3 pb-20 sm:px-8 md:pb-28">
      <h2 id="pad-backers" className="text-balance font-display text-[clamp(2.25rem,4.4vw,3.75rem)] font-medium leading-[1.04] tracking-[-0.04em]">The people behind the pad</h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink/70">Every backer here has a paid deposit verified on Solana. Names appear only with permission; otherwise we show a shortened wallet.</p>
      <Card className="mt-7 p-5 sm:p-7">
        {!result ? (
          <p role="status" className="text-[15px] leading-relaxed text-ink/70">Backer verification is unavailable right now. Please check again shortly.</p>
        ) : (
          <>
            <p className="text-[14px] tabular-nums text-ink/80">{result.count} {result.count === 1 ? 'backer' : 'backers'} · {result.deposits} {result.cluster === 'devnet' ? 'mUSDC in devnet deposits (test tokens; no real funds)' : 'USDC in deposits'}</p>
            {result.count === 0 ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                <h3 className="font-display text-[24px] font-medium tracking-[-0.025em]">Be the first backer</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/70">No verified deposits yet. Choose your pad to get started.</p>
                <Link href="/pad#models" className="mt-4 inline-flex min-h-11 items-center text-[14px] text-lime underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">Choose your pad</Link>
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-white/10 border-t border-white/10">
                {(strip ? result.backers.slice(0, 3) : result.backers).map(backer => (
                  <li key={backer.id} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                    <div className="min-w-0">
                      <p className="break-words text-[17px] font-medium [overflow-wrap:anywhere]">{backer.name}</p>
                      <p className="mt-1 text-[14px] text-ink/70">{PAD_MODELS[backer.sku].name} · {PAD_BUILDS[backer.build].name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-[13px] text-ink/70">
                      <time dateTime={backer.date}>{new Date(backer.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>
                      <a href={backer.explorer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-lime underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime" aria-label={`Verify ${backer.name}'s deposit on Solana Explorer`}>Verify deposit</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {strip && <Link href="/pad/backers" className="mt-5 inline-flex min-h-11 items-center text-[14px] text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">View the backers wall</Link>}
      </Card>
    </section>
  );
}
