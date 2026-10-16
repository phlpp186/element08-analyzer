/**
 * AppFooter — legal + brand links shown at the bottom of every route.
 *
 * Germany's Impressumspflicht (§ 5 DDG) and GDPR require the Impressum and
 * privacy notice to be reachable from every page of a commercial service, on
 * each domain. These point at the canonical pages on the main site.
 *
 * On the one-screen dive pages (960 px and wider) it shrinks to a 36 px
 * strip that the page reserves room for (DivePageLayout), so the links stay
 * on screen without the page having to scroll.
 */
import { useLocation } from 'react-router-dom';
import { isOneScreenRoute } from '../lib/divePage';

const LINKS: { label: string; href: string }[] = [
  { label: 'Impressum', href: 'https://element08.io/impressum.html' },
  { label: 'Privacy', href: 'https://element08.io/privacy.html' },
  { label: 'Terms', href: 'https://element08.io/terms.html' },
  { label: 'Safety', href: 'https://element08.io/safety.html' },
  { label: 'element08.io', href: 'https://element08.io' },
];

export function AppFooter() {
  const compact = isOneScreenRoute(useLocation().pathname);
  return (
    <footer
      className={
        compact
          ? 'mt-6 border-t border-border px-6 py-4 min-[960px]:mt-0 min-[960px]:flex min-[960px]:h-9 min-[960px]:items-center min-[960px]:overflow-hidden min-[960px]:py-0'
          : 'mt-16 border-t border-border px-6 py-6'
      }
    >
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-textDim transition-colors hover:text-accent"
          >
            {l.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
