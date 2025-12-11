import { defaultFeeConfig } from "../config/fees.js";

/**
 * Compute all fees:
 * gross → platformFee → processorFee → totalFee → net
 */
export const computeFees = ({
  grossAmountCents,
  providerFeeOverride = null,
}) => {
  const cfg = { ...defaultFeeConfig, ...(providerFeeOverride || {}) };

  const gross = grossAmountCents;

  // Platform fee (Helpio revenue)
  const platformFee = Math.floor(gross * cfg.platformFeePercent);

  // Processor fee (Stripe/Square/etc)
  const processorFee =
    Math.floor(gross * cfg.processorPercent) + cfg.processorFixedCents;

  const totalFee = platformFee + processorFee;

  const net = Math.max(0, gross - totalFee);

  return {
    platformFee,
    processorFee,
    totalFee,
    net,
    breakdown: {
      platform: cfg.platformFeePercent,
      processorPercent: cfg.processorPercent,
      processorFixed: cfg.processorFixedCents,
    },
  };
};
