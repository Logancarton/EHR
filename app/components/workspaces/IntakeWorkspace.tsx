"use client";

import Icon from "../ui/Icon";

/**
 * Dedicated front door for patient onboarding.
 *
 * The navigation destination exists now so the intake workflow has one stable
 * home while its authoritative document, eligibility, consent, and payment
 * foundations are built. This surface is intentionally honest about what is not
 * implemented yet; it does not simulate readiness or external verification.
 */
export default function IntakeWorkspace() {
  return (
    <section className="global-module-placeholder" aria-label="Patient intake workspace">
      <div className="global-module-placeholder-icon">
        <Icon name="edit_note" size="lg" />
      </div>
      <h2>Patient intake</h2>
      <p>
        This is the dedicated intake workspace. The onboarding workflow itself is not built yet.
        Demographics, identity and insurance documents, eligibility, consents, intake forms, and
        payment readiness will come together here without creating a second source of patient truth.
      </p>
    </section>
  );
}
