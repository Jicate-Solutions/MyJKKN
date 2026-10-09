/**
 * HR pay-scale YEAR LADDERS — reference shape.
 *
 * `hr.pay_scales` (platform_policies, per institution) stored only a starting
 * figure per designation + qualification (`pay_matrix`). A ladder adds the
 * salary for each year / step of service so a person's pay can be READ against
 * the band.
 *
 * REFERENCE ONLY (Director ruling 2026-09-18): a ladder never changes anyone's
 * pay. Nothing reads it to write a salary row, and nothing may. Payroll never
 * reads it. The one reader is the pay band, and only for a college with no pay
 * matrix at all (pay-band-policy-service): the Pay Band Check verdict, the
 * salary suggestion and the raise warning then use the ladders and each says
 * so ("from reference ladders"). All three are advice.
 *
 * Stored additively as `ladders` inside the existing `hr.pay_scales` value —
 * `pay_matrix` and every other key stay exactly as they are.
 */

export interface PayLadderStep {
  /** As the workbook writes it: '0-1', '2', … '20', or 'Step 1' … */
  label: string;
  /** Basic pay in whole rupees per month (workbook value rounded half-up). */
  basic_pay: number;
}

export interface PayLadder {
  /** Stable slug, unique within one institution's ladders, e.g. 'eng-ap-me-cse-it'. */
  id: string;
  staff_group: 'teaching' | 'non_teaching';
  designation: string;
  qualification: string | null;
  /** In order, first step first. */
  steps: PayLadderStep[];
  /** Plain-English caveat carried from the workbook, or null. */
  note: string | null;
  /** Where the figures came from: file · sheet · date. */
  source: string;
}
