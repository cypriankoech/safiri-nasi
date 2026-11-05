import { Container } from "@/components/ui/misc";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold text-primary">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
      <div className="prose-safiri mt-8">{children}</div>
    </Container>
  );
}
