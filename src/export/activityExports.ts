/**
 * The three files the activity trail hands over, and the one way they are handed over (2026-10-01).
 *
 * Moved out of `app/activity.tsx` so the phone screen and the desktop page export through exactly the same code: the
 * same reads, the same refusal to hand over a file with no records in it, the same delivery.
 */
import { useState } from 'react';
import { repos } from '@/data';
import { exportRecords } from '@/data/system';
import { deliverFile } from '@/export/deliver';
import { errorText } from '@/data/apiError';

export type ExportKind = 'fills' | 'disposals' | 'trail';

/**
 * The three documents, and what each one is for.
 *
 * They are not variations of one file. Each answers a different question for a different reader,
 * and the empty sentence differs for the same reason — "no trades yet" and "nothing sold yet" are
 * different facts about the same wallet.
 *
 *   fills     — a receipt. What moved, when, at what price, on which transaction. ONLY runs that
 *               settled and carry a signature: a receipt for something that did not happen is not
 *               a weaker receipt, it is a false one.
 *   disposals — the tax document. Sales with cost basis, average cost stated in the file rather
 *               than assumed, because a jurisdiction that wants FIFO needs to be told this is not it.
 *   trail     — the compliance artifact. EVERY row, blocked runs included, hash-chained. The
 *               blocked ones are the point: they are where the safety layer did its job.
 */
export const EXPORTS: Record<
  ExportKind,
  { label: string; what: string; filename: string; empty: string; read: () => Promise<string> }
> = {
  fills: {
    label: 'Receipts',
    what: 'Every settled trade, with its transaction',
    filename: 'xorr-fills.csv',
    empty: 'Nothing has settled yet, so there are no receipts.',
    read: () => repos.activity.exportFills(),
  },
  disposals: {
    label: 'Disposals',
    what: 'Sales with their cost basis, for tax',
    filename: 'xorr-disposals.csv',
    empty: 'Nothing sold yet, so there is nothing to report.',
    read: () => repos.activity.exportDisposals(),
  },
  trail: {
    label: 'Audit trail',
    what: 'Every row, blocked runs included',
    filename: 'xorr-audit.csv',
    empty: 'Nothing to export yet.',
    read: () => repos.activity.exportTrail('csv'),
  },
};

/** The order the three are offered in: what you bought, what you sold, then everything. */
export const EXPORT_ORDER: readonly ExportKind[] = ['fills', 'disposals', 'trail'];

export type ExportNote = { text: string; failed: boolean };

/**
 * One file out of the app, delivered the way `/export` delivers it: a download in a browser, a share sheet on a phone.
 *
 * This called `Share.share`, which Chrome rejects outright — the exact failure `/export` was fixed for, one screen
 * over. The two now share `deliverFile`, and the same refusal to hand over a file with no records in it.
 */
export function useActivityExports() {
  /** Which of the three files is being fetched, if any. One at a time: they share one note. */
  const [exportingWhich, setExportingWhich] = useState<ExportKind>();
  /** A failure, or an empty file said as one. Kept apart so "Nothing to export yet." is not reported as a failed export. */
  const [exportNote, setExportNote] = useState<ExportNote>();

  async function exportFile(which: ExportKind) {
    const file = EXPORTS[which];
    setExportingWhich(which);
    setExportNote(undefined);
    try {
      // `read`, not `fetch`: `repositories.test.ts` bans the literal token in a screen, and the
      // rule is worth more than the name — every call here goes through the data layer.
      const csv = await file.read();
      if (exportRecords(csv, 'csv') === 0) {
        setExportNote({ text: file.empty, failed: false });
        return;
      }
      const out = await deliverFile(file.filename, csv);
      // A dismissed share sheet is a change of mind, which `deliverFile` words as "Cancelled." — not a failure to report.
      if (!out.ok && out.reason !== 'Cancelled.') setExportNote({ text: `Export failed: ${out.reason}`, failed: true });
    } catch (e) {
      // On the screen, not in a console nobody reads. An export that silently fails is
      // worse than none: the user walks away believing they have the record.
      setExportNote({ text: `Export failed: ${errorText(e)}`, failed: true });
    } finally {
      setExportingWhich(undefined);
    }
  }

  return { exportingWhich, exportNote, exportFile };
}
