import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="pt-6">
      <Skeleton className="mb-3 h-5 w-64" />
      <Skeleton className="mb-6 h-12 w-3/4" />
      <Skeleton className="h-[300px] rounded-3xl sm:h-[420px] lg:h-[480px]" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="hidden h-[560px] lg:block" />
      </div>
    </Container>
  );
}
