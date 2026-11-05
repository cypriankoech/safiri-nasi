import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="py-8">
      <Skeleton className="mb-8 h-10 w-72" />
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </Container>
  );
}
