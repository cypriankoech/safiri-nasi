"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { TourEditor } from "@/components/admin/tour-editor";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { AdminTour } from "@/lib/admin-types";

export default function EditTourPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "tour", id], queryFn: () => api<AdminTour>(`/api/admin/tours/${id}`) });
  if (error) return <p className="text-danger">{error.message}</p>;
  if (isLoading || !data) return <Skeleton className="h-[600px]" />;
  return <TourEditor key={data.id} initial={data} />;
}
