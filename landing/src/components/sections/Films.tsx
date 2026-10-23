"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { BlurWords } from "@/components/motion/BlurWords";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

const EASE = [0.16, 1, 0.3, 1] as const;

const FILMS = [
  {
    id: "intro",
    label: "The film",
    length: "0:20",
    src: "/media/intro.mp4",
    poster: "/media/intro-poster.webp",
    title: "Stocks never sleep",
  },
  {
    id: "demo",
    label: "The demo",
    length: "5:13",
    src: "/media/demo.mp4",
    poster: "/media/demo-poster.webp",
    title: "xorr, start to finish, on Solana mainnet",
  },
] as const;

type FilmId = (typeof FILMS)[number]["id"];

/** The intro film and the full product demo, in one player with a switch between them. */
export function Films() {
  const [current, setCurrent] = useState<FilmId>("intro");
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const film = FILMS.find((f) => f.id === current)!;

  function play() {
    // Inside the tap itself: iOS Safari allows sound only for a play() the gesture started.
    const v = video.current;
    if (!v) return;
    setPlaying(true);
    void v.play().catch(() => setPlaying(false));
  }

  return (
    <section id="watch" className="relative scroll-mt-6 px-3 pb-20 pt-6 sm:px-8 md:pb-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Reveal>
          <Badge icon="play">Watch</Badge>
        </Reveal>
        <h2 className="mt-6 text-balance font-display text-[clamp(2.25rem,4.4vw,3.75rem)] font-medium leading-[1.04] tracking-[-0.04em]">
          <BlurWords text="See it trade" />
        </h2>
        <Reveal delay={0.3}>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink/55">
            Twenty seconds of why, then five minutes of the real thing: agents buying tokenized stocks on Solana mainnet.
          </p>
        </Reveal>

        <Reveal delay={0.4} className="mt-8">
          <div role="tablist" aria-label="Choose a film" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
            {FILMS.map((f) => {
              const on = f.id === current;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    // Switching films stops the one that was playing and shows the next one's poster.
                    setCurrent(f.id);
                    setPlaying(false);
                  }}
                  className={`relative flex h-10 items-center gap-2 rounded-full px-5 text-[14px] transition-colors duration-200 ${on ? "text-[#07080a]" : "text-ink/60 hover:text-ink"}`}
                >
                  {on ? (
                    <motion.span layoutId="film-pill" transition={{ duration: 0.45, ease: EASE }} className="absolute inset-0 rounded-full bg-ink" />
                  ) : null}
                  <span className="relative font-medium">{f.label}</span>
                  <span className={`relative tabular-nums ${on ? "text-[#07080a]/55" : "text-ink/35"}`}>{f.length}</span>
                </button>
              );
            })}
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.2} y={40} className="mx-auto mt-10 max-w-6xl">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(60%_55%_at_50%_50%,rgba(47,91,255,0.35),transparent_70%)] blur-2xl"
          />
          <div className="relative aspect-video overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_40px_120px_-40px_rgba(47,91,255,0.6)]">
            <video
              key={film.id}
              ref={video}
              src={film.src}
              poster={film.poster}
              controls={playing}
              playsInline
              preload="metadata"
              onEnded={() => setPlaying(false)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <AnimatePresence>
              {playing ? null : (
                <motion.button
                  key={`cover-${film.id}`}
                  type="button"
                  onClick={play}
                  aria-label={`Play ${film.label.toLowerCase()}, ${film.length}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="group absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(3,3,4,0.55),rgba(3,3,4,0.15)_60%)]"
                >
                  <span className="relative grid size-20 place-items-center rounded-full bg-ink text-[#07080a] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-out group-hover:scale-110 group-active:scale-95 md:size-24">
                    <span className="absolute inset-0 animate-ping rounded-full bg-ink/30 motion-reduce:animate-none" />
                    <Icon name="play" className="relative ml-1 size-7 md:size-8" strokeWidth={0} fill="currentColor" />
                  </span>
                  <span className="mt-5 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-[13px] text-ink/85 backdrop-blur-md">
                    Play {film.label.toLowerCase()} · {film.length} · sound on
                  </span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-4 px-2 text-[13px] text-ink/45">
            <span className="text-ink/75">{film.title}</span> · {film.length}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
