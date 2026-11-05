import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="py-8">
      <Skeleton className="mb-6 h-10 w-60" />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-72" />
      </div>
    </Container>
  );
}
