import { Suspense } from "react";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { getSite } from "@/lib/server-api";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const site = await getSite();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Header
        categories={site.categories}
        destinations={site.destinations}
        phone={site.settings.phone}
        announcement={site.settings.announcement}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer site={site} />
      <Suspense fallback={null}>
        <WhatsAppButton number={site.settings.whatsapp} />
      </Suspense>
    </>
  );
}
