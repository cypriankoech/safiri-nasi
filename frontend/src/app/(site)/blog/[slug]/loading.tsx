import { Container, Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="max-w-3xl space-y-4 pt-10">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-80 w-full" />
    </Container>
  );
}
