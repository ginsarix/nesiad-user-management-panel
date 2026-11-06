import type { Metadata } from "next";
import { ApplicationForm } from "./application-form";

// Never prerender: a cached page would point at /_next/static chunks that the
// next deploy deletes
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Üyelik Başvurusu · NESİAD",
};

export default function MembershipApplicationPage() {
  return <ApplicationForm />;
}
