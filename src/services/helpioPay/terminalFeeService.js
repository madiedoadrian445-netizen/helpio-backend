// src/services/helpioPay/terminalFeeService.js
import { calculateFees } from "../../utils/feeCalculator.js";

/**
 * Compute Helpio Pay fee model for a gross amount in cents.
 * Uses the centralized feeCalculator (Stripe 2.9% + 30¢ + Helpio 1%).
 */
export const computeTerminalFeesForGrossCents = (grossCents) => {
  const fees = calculateFees(grossCents || 0);

  return {
    stripeFeeCents: fees.processorFeeCents,
    helpioFeeCents: fees.platformFeeCents,
    totalFeeCents: fees.totalFeeCents,
    netCents: fees.netAmountCents,
  };
};
