import type { Metadata } from "next";
import DashboardPreview from "../../components/preview/DashboardPreview";

/**
 * The DB-1 dashboard prototype (roadmap §21).
 *
 * A repository-owned preview route, not a second home. It renders synthetic fixtures
 * only and issues no request, so it cannot touch a record however it is driven. The
 * live dashboard stays exactly where it is until Logan has reviewed this.
 */
export const metadata: Metadata = {
  title: "Dashboard design preview — Clinical Bond",
  description: "Synthetic, clickable prototype of the schedule-first dashboard. Not a live record view.",
};

export default function DashboardPreviewPage() {
  return <DashboardPreview />;
}
