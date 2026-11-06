import type { Metadata } from "next";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = {
  title: "Üyelik Başvurusu · NESİAD",
};

export default function MembershipApplicationPage() {
  return <ApplicationForm />;
}
