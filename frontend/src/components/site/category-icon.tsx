import {
  Binoculars,
  Compass,
  Heart,
  Landmark,
  Mountain,
  Plane,
  Sun,
  Tent,
  TreePalm,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  binoculars: Binoculars,
  palm: TreePalm,
  tent: Tent,
  sun: Sun,
  mountain: Mountain,
  plane: Plane,
  heart: Heart,
  users: Users,
  landmark: Landmark,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Compass;
  return <Icon className={className} aria-hidden />;
}
