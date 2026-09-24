import type { Metadata } from "next";
import { ShippingSection } from "@/components/sections/ShippingSection";
import { PageShell } from "@/components/site/PageShell";
import { getNow, loadShipping } from "@/lib/dashboard";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/traffico-marittimo");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Navi in transito negli stretti di Hormuz e Bab el-Mandeb: media degli ultimi 7 giorni confrontata con il traffico normale. Fonte: IMF PortWatch.",
};

/**
 * /traffico-marittimo — sezione 05 (24 set 2026). Passo 1 della UI: le
 * schede per passaggio. Grafico con il Brent, mappa, cella in home e
 * metodologia arrivano nei passi successivi (vedi CLAUDE.md).
 */
export default async function TrafficoMarittimoPage() {
  const { chokepoints, headline, run } = await loadShipping();
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Quante navi attraversano gli stretti di Hormuz e Bab el-Mandeb, e quanto il traffico si allontana dal normale."
      consultedOn={now}
    >
      <ShippingSection
        number={PAGE.number}
        chokepoints={chokepoints}
        headline={headline}
        checkedAt={run?.startedAt ?? null}
      />
    </PageShell>
  );
}
