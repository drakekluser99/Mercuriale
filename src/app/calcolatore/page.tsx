import type { Metadata } from "next";
import FuelImpactCalculator from "@/components/FuelImpactCalculator";
import { KeyFigure } from "@/components/KeyFigure";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET, PageShell } from "@/components/site/PageShell";
import { getNow, loadCalculator } from "@/lib/dashboard";
import { formatPercent } from "@/lib/format";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/calcolatore");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Quanto costa un pieno oggi, un mese fa e un anno fa, e quanto pesa il carburante sui trasporti. Europa e Stati Uniti a confronto.",
};

/** /calcolatore — ex sezione 02 della home (16 set 2026). */
export default async function CalcolatorePage() {
  const calc = await loadCalculator();
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Quanto costa un pieno per un'auto normale — oggi, un mese fa, un anno fa — e quanto pesa il carburante sui trasporti che portano cibo, materiali e merci."
      consultedOn={now}
    >
      <section>
        <SectionHeading number={PAGE.number} title="Il pieno e i trasporti" />
        {calc.euTaxShare !== null && (
          // Una quota non è una variazione: niente "+" davanti.
          <KeyFigure value={formatPercent(calc.euTaxShare).replace("+", "")}>
            del prezzo medio della benzina nei 27 paesi UE sono imposte:
            accisa, IVA e altre voci. Il resto è il carburante.
          </KeyFigure>
        )}
        {calc.available ? (
          <div className="mt-6">
            <FuelImpactCalculator europe={calc.europe} us={calc.us} />
          </div>
        ) : (
          <EmptyState label={NO_DATA_YET} />
        )}
        <SourceNote sources={["eu-commission", "eia"]}>
          Fonte: medie dei prezzi della Commissione Europea (27 paesi UE) e
          dell&apos;EIA (Stati Uniti) · valute originali, nessuna conversione
          fra euro e dollari
        </SourceNote>
      </section>
    </PageShell>
  );
}
