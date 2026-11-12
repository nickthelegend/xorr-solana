import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { APP_URL, GITHUB_URL } from "@/lib/links";

/** Shared verbatim with the home page's closing section. */
export function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-36 flex max-w-6xl flex-col items-center gap-5 border-t border-white/[0.08] pt-7 text-[13px] text-ink/45 md:flex-row md:justify-between">
      <span>© 2026 xorr. All rights reserved.</span>
      <a
        href={GITHUB_URL}
        aria-label="xorr on GitHub"
        className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ink/70 transition-colors duration-200 hover:text-ink"
      >
        <Icon name="github" className="size-4" />
      </a>
      <nav className="flex items-center gap-6">
        <Link href="/hiring" className="transition-colors duration-200 hover:text-ink">
          We&apos;re hiring
        </Link>
        <a href={APP_URL} className="transition-colors duration-200 hover:text-ink">
          Open the app
        </a>
      </nav>
    </footer>
  );
}
