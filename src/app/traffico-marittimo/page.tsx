import type { Metadata } from "next";
import { ShippingSection } from "@/components/sections/ShippingSection";
import { PageShell } from "@/components/site/PageShell";
import {
  getNow,
  loadShipping,
  loadShippingChartInitial,
  SHIPPING_CHART_INITIAL_WINDOW,
} from "@/lib/dashboard";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/traffico-marittimo");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Navi in transito a Hormuz, Bab el-Mandeb e Suez: media degli ultimi 7 giorni confrontata con il traffico normale. Fonte: IMF PortWatch.",
};

/**
 * /traffico-marittimo — sezione 05 (24 set 2026): schede per passaggio
 * (passo 1) e grafico dei transiti con il Brent sotto (passo 2). Mappa,
 * cella in home e metodologia arrivano nei passi successivi (CLAUDE.md).
 */
export default async function TrafficoMarittimoPage() {
  const [{ chokepoints, headline, run }, chart] = await Promise.all([
    loadShipping(),
    loadShippingChartInitial(),
  ]);
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Quante navi attraversano lo Stretto di Hormuz, lo Stretto di Bab el-Mandeb e il Canale di Suez, e quanto il traffico si allontana dal normale."
      consultedOn={now}
    >
      <ShippingSection
        number={PAGE.number}
        chokepoints={chokepoints}
        headline={headline}
        checkedAt={run?.startedAt ?? null}
        chart={chart}
        chartWindow={SHIPPING_CHART_INITIAL_WINDOW}
      />
    </PageShell>
  );
}
