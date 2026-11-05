import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-80 rounded-none" />
      <Container className="grid gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </Container>
    </>
  );
}
