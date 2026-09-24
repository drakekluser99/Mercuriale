import type { Metadata } from "next";
import { InflationSection } from "@/components/sections/InflationSection";
import { PageShell } from "@/components/site/PageShell";
import { getNow, loadInflation } from "@/lib/dashboard";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/inflazione");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Inflazione in Italia: variazione annua dei prezzi al consumo, del carrello della spesa, degli alimentari e dei beni energetici, con l'indice dal 2016. Fonte: ISTAT (NIC).",
};

/**
 * /inflazione — sezione 06 (24 set 2026): una scheda per serie (passo 1)
 * e il grafico dal 2016 (passo 2). Anteprima in home e metodologia
 * arrivano nei passi successivi (CLAUDE.md).
 */
export default async function InflazionePage() {
  const { series, headline, latestMonth, freshness, run, chartPoints } = await loadInflation();
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Di quanto aumentano i prezzi al consumo in Italia: in generale, nel carrello della spesa, negli alimentari e nei beni energetici."
      consultedOn={now}
    >
      <InflationSection
        number={PAGE.number}
        series={series}
        headline={headline}
        latestMonth={latestMonth}
        freshness={freshness}
        checkedAt={run?.startedAt ?? null}
        chartPoints={chartPoints}
      />
    </PageShell>
  );
}
