// src/utils/feeCalculator.js
import { defaultFeeConfig } from "../config/fees.js";

/**
 * Calculate processor + platform fees for any Helpio Pay transaction.
 * Returns values in CENTS.
 */
export const calculateFees = (amountCents, customConfig = {}) => {
  const cfg = { ...defaultFeeConfig, ...customConfig };

  const processorFee =
    Math.floor(amountCents * cfg.processorPercent) +
    cfg.processorFixedCents;

  const platformFee = Math.floor(amountCents * cfg.platformFeePercent);

  const totalFee = processorFee + platformFee;

  const net = Math.max(0, amountCents - totalFee);

  return {
    grossAmountCents: amountCents,
    processorFeeCents: processorFee,
    platformFeeCents: platformFee,
    totalFeeCents: totalFee,
    netAmountCents: net,
  };
};
