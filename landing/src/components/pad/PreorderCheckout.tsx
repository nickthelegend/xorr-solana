// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { PadSku, PadBuild } from '@/lib/pad-pricing';
import type { PreorderConfig } from '@/lib/preorder-config';

const PreorderSheet = dynamic(() => import('./PreorderSheet'), { ssr: false });
export const preorderButton = 'inline-flex min-h-[52px] items-center justify-center rounded-full bg-lime px-6 text-[14px] font-medium text-[#0c1003] transition-colors duration-200 hover:bg-[#d5fa69] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime disabled:opacity-60';

export function PreorderCheckout({ sku, build, deposit }: { sku: PadSku; build: PadBuild; deposit: number }) {
  const [config, setConfig] = useState<PreorderConfig | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/pad/preorder', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (response.ok) setConfig(await response.json()); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <>
    <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[14px] text-ink/70">{config ? config.cluster === 'devnet' ? 'Devnet preview · test tokens only' : 'Refundable before your order ships' : 'Pre-orders open soon'}</p>
      {config ? <button type="button" className={preorderButton} onClick={() => setOpen(true)}>Reserve with ${deposit} deposit</button>
        : <a href="#waitlist" className={preorderButton}>Join the waitlist</a>}
    </div>
    {open && config && <PreorderSheet sku={sku} build={build} config={config} onClose={() => setOpen(false)} />}
  </>;
}
