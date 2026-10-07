import type { Metadata } from "next";
import { Suspense } from "react";
import IntakeSelfServicePortal from "../../components/intake/IntakeSelfServicePortal";

export const metadata: Metadata = {
  // Neutral until the link loads: the same page serves the intake packet and
  // forms a clinician sent from a chart. The portal names which once it knows.
  title: "Patient Forms — Clinical Bond",
  description: "Secure, confidential patient forms, questionnaires and consents.",
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
