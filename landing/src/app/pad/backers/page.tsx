// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
import type { Metadata } from 'next';
import Link from 'next/link';
import { PadBackers } from '@/components/pad/PadBackers';
import { Footer } from '@/components/sections/Footer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'xorrpad backers', description: 'Paid xorrpad deposits, verified on Solana.', alternates: { canonical: '/pad/backers' } };

export default function BackersPage() {
  return (
    <main className="pb-3">
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[32px] border border-white/[0.06] bg-[#060608] sm:mx-3 sm:mt-3">
        <header className="mx-auto max-w-6xl px-3 pb-16 pt-7 sm:px-8">
          <Link href="/pad" className="inline-flex min-h-11 items-center text-[14px] text-ink/70 underline underline-offset-4 hover:text-ink">Back to xorrpad</Link>
        </header>
        <PadBackers />
        <Footer />
      </div>
    </main>
  );
}
