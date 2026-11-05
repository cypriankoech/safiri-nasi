import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-center">
      <div>
        <p className="font-hand text-3xl text-sun-strong">Pole sana!</p>
        <h1 className="mt-2 text-5xl font-extrabold text-primary">We took a wrong turn</h1>
        <p className="mt-3 text-muted">The page you&apos;re looking for isn&apos;t on our map.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className={buttonClass({})}>Back home</Link>
          <Link href="/tours" className={buttonClass({ variant: "outline" })}>Browse tours</Link>
        </div>
      </div>
    </main>
  );
}
