import type { Metadata } from "next";
import BillingPrototypePreview from "../../components/preview/BillingPrototypePreview";

/**
 * The retained billing and financial-integration visual prototypes (roadmap P9-0).
 *
 * A repository-owned preview route, not a second billing system. It renders
 * invented fixtures only and issues no request, so it cannot touch a financial or
 * clinical record however it is driven. The working Billing destination lives in
 * the workspace and reads `/api/billing`.
 */
export const metadata: Metadata = {
  title: "Billing design preview — Clinical Bond",
  description:
    "Synthetic prototype of the claims and financial-integration layouts. Not a live billing system; no claim can be transmitted from it.",
};

export default function BillingPreviewPage() {
  return <BillingPrototypePreview />;
}
