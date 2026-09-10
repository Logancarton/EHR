/**
 * Which encounter note sections the template shows.
 *
 * The clinician's Layout Customizer choices decide the default, with one safety
 * override: a section that already holds text always renders. Hiding a field is a
 * template preference, not a way to remove what has been written — content that
 * reaches the signed note must stay visible while the note is being written, or the
 * clinician would sign words they cannot see.
 */
export type EncounterSectionVisibility = {
  showIntervalHistory: boolean;
  showTreatmentResponse: boolean;
  showSideEffects: boolean;
  showAssessment: boolean;
  showPlan: boolean;
};

export type EncounterSectionContent = {
  intervalHistory?: string;
  treatmentResponse?: string;
  sideEffects?: string;
  assessment?: string;
  plan?: string;
};

function hasContent(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function encounterTemplateSectionVisibility(
  preferred: EncounterSectionVisibility,
  draft: EncounterSectionContent,
): EncounterSectionVisibility {
  return {
    showIntervalHistory: preferred.showIntervalHistory || hasContent(draft.intervalHistory),
    showTreatmentResponse: preferred.showTreatmentResponse || hasContent(draft.treatmentResponse),
    showSideEffects: preferred.showSideEffects || hasContent(draft.sideEffects),
    showAssessment: preferred.showAssessment || hasContent(draft.assessment),
    showPlan: preferred.showPlan || hasContent(draft.plan),
  };
}
