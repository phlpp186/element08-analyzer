/**
 * AppFooter — legal + brand links shown at the bottom of every route.
 *
 * Germany's Impressumspflicht (§ 5 DDG) and GDPR require the Impressum and
 * privacy notice to be reachable from every page of a commercial service, on
 * each domain. These point at the canonical pages on the main site.
 */
const LINKS: { label: string; href: string }[] = [
  { label: 'Impressum', href: 'https://element08.io/impressum.html' },
  { label: 'Privacy', href: 'https://element08.io/privacy.html' },
  { label: 'Terms', href: 'https://element08.io/terms.html' },
  { label: 'Safety', href: 'https://element08.io/safety.html' },
  { label: 'element08.io', href: 'https://element08.io' },
];

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-border px-6 py-6">
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
