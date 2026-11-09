import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Text marks rather than trademarked logo artwork. */
export function PaymentLogos({ className, light = false }: { className?: string; light?: boolean }) {
  const chip = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-extrabold tracking-tight",
    light ? "bg-surface border border-border" : "bg-white",
  );
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <span className={cn(chip, "text-[#3aa935]")}>
        M<span className="text-[#e3262b]">-</span>PESA
      </span>
      <span className={cn(chip, "text-[#e3262b]")}>airtel money</span>
      <span className={cn(chip, "text-[#1a1f71]")}>VISA</span>
      <span className={cn(chip, "text-[#222]")}>
        <span className="inline-flex">
          <span className="h-3.5 w-3.5 rounded-full bg-[#eb001b]" />
          <span className="-ml-1.5 h-3.5 w-3.5 rounded-full bg-[#f79e1b] mix-blend-multiply" />
        </span>
        mastercard
      </span>
      <span className={cn(chip, "text-[#0ba4db]")}>
        <ShieldCheck className="h-3.5 w-3.5" /> Paystack
      </span>
    </div>
  );
}
