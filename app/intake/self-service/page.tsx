import type { Metadata } from "next";
import { Suspense } from "react";
import IntakeSelfServicePortal from "../../components/intake/IntakeSelfServicePortal";

export const metadata: Metadata = {
  title: "Patient Intake Self-Service — Clinical Bond",
  description: "Secure, confidential prospective patient onboarding and clinical questionnaire submission.",
};

export default function IntakeSelfServicePage() {
  return (
    <Suspense
      fallback={
        <div className="portal-body" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          <p style={{ color: "#64748b", fontSize: "16px" }}>Opening secure patient portal…</p>
        </div>
      }
    >
      <IntakeSelfServicePortal />
    </Suspense>
  );
}
