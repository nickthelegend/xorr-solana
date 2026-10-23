"use client";

import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  arrivedWithRef,
  BOOST_PER_REFERRAL,
  forget,
  joinWaitlist,
  placeFor,
  rememberedCode,
  shareLink,
  waitlistTotal,
  WaitlistError,
  type Place,
} from "@/lib/waitlist";

const EASE = [0.16, 1, 0.3, 1] as const;

/*
 * One waitlist state for the page. The hero and the closing section both show the form; joining in one shows your place
 * in both, and the live count is read once and shared.
 */
type State = { total: number | null; place: Place | null; fresh: boolean; checked: boolean };
let state: State = { total: null, place: null, fresh: false, checked: false };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const noop = () => () => undefined;
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const SERVER_STATE: State = { total: null, place: null, fresh: false, checked: false };

let started = false;
function start() {
  if (started) return;
  started = true;
  const refresh = () =>
    waitlistTotal()
      .then((total) => set({ total: Math.max(total, state.place?.total ?? 0) }))
      .catch(() => undefined);
  void refresh();
  // A live line: the count moves while the page is open.
  setInterval(refresh, 20_000);
  const code = rememberedCode();
  if (!code) {
    set({ checked: true });
    return;
  }
  placeFor(code)
    .then((place) => {
      if (!place) forget();
      set({ place, checked: true });
    })
    .catch(() => set({ checked: true }));
}

function useWaitlist() {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function Waitlist({ className = "" }: { className?: string }) {
  const { total, place, fresh } = useWaitlist();
  return (
    <div className={`flex w-full max-w-[520px] flex-col items-center ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {place ? (
          <motion.div
            key="place"
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="w-full"
          >
            <PlaceCard place={place} total={total ?? place.total} celebrate={fresh} />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="flex w-full flex-col items-center"
          >
            <JoinForm />
            <LiveCount total={total} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JoinForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read after hydration: the server has no URL to read it from.
  const ref = useSyncExternalStore(noop, arrivedWithRef, () => null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const place = await joinWaitlist(email, ref, website);
      set({ place, fresh: !place.already, total: Math.max(place.total, state.total ?? 0) });
    } catch (err) {
      setError(err instanceof WaitlistError ? err.message : "Could not reach the line. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center" noValidate>
      {ref ? (
        <p className="mb-3 text-[13px] text-lime/90">A friend sent you. Joining moves them up the line.</p>
      ) : null}
      <div className="group flex h-[52px] w-full items-center rounded-full border border-white/10 bg-white/[0.05] p-1 pl-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-20px_rgba(47,91,255,0.55)] backdrop-blur-md transition-colors duration-200 focus-within:border-white/25">
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink/35 focus:outline-none"
        />
        {/* No person sees this field; a bot that fills it is turned away. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-[#07080a] transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.97] disabled:opacity-70"
        >
          {busy ? (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-[#07080a]/30 border-t-[#07080a]" />
              Joining
            </>
          ) : (
            <>
              Join the waitlist
              <Icon name="arrowUpRight" className="size-4" strokeWidth={2} />
            </>
          )}
        </button>
      </div>
      <AnimatePresence>
        {error ? (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-[13px] text-[#ff8a8a]"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

function LiveCount({ total }: { total: number | null }) {
  return (
    <p className="mt-4 flex h-5 items-center gap-2 text-[13px] text-ink/55">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/70 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-mint" />
      </span>
      {total === null ? (
        "The line is open"
      ) : (
        <span>
          <Counter value={total} className="font-medium tabular-nums text-ink/85" /> {total === 1 ? "person" : "people"} in line
        </span>
      )}
    </p>
  );
}

/** A number that rolls to its new value instead of jumping. */
function Counter({ value, from, className, duration = 1.2 }: { value: number; from?: number; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [initial] = useState(from ?? value);
  const shown = useRef(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = value.toLocaleString("en-US");
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = Math.round(v).toLocaleString("en-US");
      },
    });
    return () => controls.stop();
  }, [value, reduce, duration]);
  return (
    <span ref={ref} className={className}>
      {Math.round(initial).toLocaleString("en-US")}
    </span>
  );
}

function PlaceCard({ place, total, celebrate }: { place: Place; total: number; celebrate: boolean }) {
  const link = shareLink(place.refCode);
  const [copied, setCopied] = useState(false);
  const text = `I'm #${place.position} in line for xorr: AI agents that trade tokenized US stocks on Solana. Jump the line with my link:`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (an insecure context or a denied permission); the link stays visible to copy by hand.
    }
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(22,24,34,0.96),rgba(8,9,13,0.96))] p-5 text-left shadow-[0_30px_80px_-30px_rgba(47,91,255,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,rgba(200,245,60,0.35),transparent_65%)] blur-2xl" />
      {celebrate ? <Burst /> : null}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-lime">
            <Icon name="check" className="size-3.5" strokeWidth={2.4} />
            {place.already ? "You're already in" : "You're in"}
          </p>
          <p className="mt-2 font-display text-[clamp(2.8rem,8vw,4.2rem)] font-medium leading-none tracking-[-0.05em] text-ink">
            #<Counter value={place.position} from={celebrate ? total : place.position} duration={celebrate ? 1.6 : 0.01} className="tabular-nums" />
          </p>
          <p className="mt-2 text-[14px] text-ink/55">
            of <span className="tabular-nums text-ink/80">{total.toLocaleString("en-US")}</span> in line
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 pt-1 text-right">
          <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-ink/80">
            <Icon name="users" className="size-4" />
          </span>
          <span className="mt-1 text-[22px] font-medium tabular-nums text-ink">{place.referrals}</span>
          <span className="text-[12px] text-ink/45">{place.referrals === 1 ? "friend joined" : "friends joined"}</span>
        </div>
      </div>

      <p className="relative mt-4 text-[13.5px] leading-relaxed text-ink/65">
        Every friend who joins with your link moves you <span className="text-ink">{BOOST_PER_REFERRAL} places</span> up.
      </p>
      <div className="relative mt-3 flex h-12 items-center rounded-full border border-white/10 bg-black/30 p-1 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink/75">{link.replace("https://", "")}</span>
        <button
          type="button"
          onClick={copy}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-[#07080a] transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.97]"
        >
          <Icon name={copied ? "check" : "copy"} className="size-3.5" strokeWidth={2.2} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-2">
        <ShareLink href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}>
          X
        </ShareLink>
        <ShareLink href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}>WhatsApp</ShareLink>
        <ShareLink href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`}>
          Telegram
        </ShareLink>
      </div>
      <button
        type="button"
        onClick={() => {
          forget();
          set({ place: null, fresh: false });
        }}
        className="relative mt-4 text-[12px] text-ink/40 underline-offset-4 transition-colors hover:text-ink/70 hover:underline"
      >
        Not you? Use another email
      </button>
    </div>
  );
}

function ShareLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Share on ${typeof children === "string" ? children : "social"}`}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-[13px] text-ink/80 transition-colors duration-200 hover:border-white/20 hover:text-ink"
    >
      {children}
      <Icon name="arrowUpRight" className="size-3.5" />
    </a>
  );
}

/** A short burst of brand-coloured specks from the number, once, on a fresh join. */
const BURST_COLORS = ["#c8f53c", "#0dd87e", "#2f5bff", "#b7a6ff", "#f3f0e8"];
function Burst() {
  const reduce = useReducedMotion();
  const [pieces] = useState(() =>
    Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 90 + Math.random() * 120;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.7 - 30,
        rotate: Math.random() * 360,
        size: 4 + Math.random() * 5,
        color: BURST_COLORS[i % BURST_COLORS.length],
        round: i % 3 === 0,
      };
    }),
  );
  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute left-[22%] top-[38%]">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? 999 : 1 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 60], opacity: [1, 1, 0], rotate: p.rotate, scale: 1 }}
          transition={{ duration: 1.5, ease: [0.2, 0.8, 0.3, 1], delay: 0.35 }}
        />
      ))}
    </div>
  );
}
