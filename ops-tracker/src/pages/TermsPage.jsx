import { PageHeader } from "../components/layout/AppShell.jsx";
import { Card } from "../components/ui/core.jsx";
import { Pill } from "../components/ui/badges.jsx";
import { TERMS, TERMS_META } from "./terms.js";

export default function TermsPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader title="Terms of service" subtitle={`Internal use · ${TERMS_META.version} · last updated ${TERMS_META.updated}`} actions={<Pill tone="warning">Draft – pending legal review</Pill>} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-[13px]">
            {TERMS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-ink-2 hover:bg-ink/[0.04] hover:text-ink">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <Card as="article" className="max-w-3xl px-6 py-6 sm:px-8">
          {TERMS.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 border-b border-line py-5 first:pt-0 last:border-0 last:pb-0">
              <h2 className="mb-2 text-[16px] font-semibold text-ink">{i + 1}. {s.title}</h2>
              {s.body.map((p) => <p key={p.slice(0, 32)} className="mb-2 text-[14px] leading-relaxed text-ink-2 last:mb-0">{p}</p>)}
            </section>
          ))}
        </Card>
      </div>
    </div>
  );
}
