import type { Metadata } from "next";
import { AccountView } from "@/components/site/account-view";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = { title: "My trips", robots: { index: false } };

export default function AccountPage() {
  return (
    <Container className="py-10">
      <h1 className="mb-8 text-4xl font-extrabold text-primary">My trips</h1>
      <AccountView />
    </Container>
  );
}
