'use client';

/**
 * Fee configuration hooks — thin re-export wrapper over the general
 * `use-campus-living-settings` module, isolated here so the Fee Config
 * page imports only what it needs.
 *
 * Wired 2026-04-24 (Agent D — settings real-save) to replace the
 * previousfake Save handler on /campus-living/settings/fee-config.
 */

export {
  useHostelFeeConfigs,
  useHostelFeeConfig,
  useCreateHostelFeeConfig,
  useUpdateHostelFeeConfig,
  useDeleteHostelFeeConfig,
  campusLivingSettingsKeys,
} from './use-campus-living-settings';
