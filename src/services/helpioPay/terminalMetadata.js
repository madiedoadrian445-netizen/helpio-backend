// src/services/helpioPay/terminalMetadata.js

export const buildBaseTerminalMetadata = () => ({
  brand: "Helpio Pay",
  type: "helpio_terminal_transaction",
});

/**
 * Generic metadata for a standalone terminal charge
 */
export const buildGenericTerminalMetadata = ({
  invoiceId = "",
  subscriptionId = "",
} = {}) => ({
  ...buildBaseTerminalMetadata(),
  invoiceId,
  subscriptionId,
});

/**
 * Metadata specifically for an invoice terminal charge
 */
export const buildInvoiceTerminalMetadata = ({
  invoiceId,
  providerId,
  customerId,
}) => ({
  brand: "Helpio Pay",
  type: "helpio_terminal_invoice_charge",
  invoiceId: String(invoiceId),
  providerId: providerId ? String(providerId) : "",
  customerId: customerId ? String(customerId) : "",
});

/**
 * Metadata specifically for a subscription terminal charge
 */
export const buildSubscriptionTerminalMetadata = ({
  subscriptionId,
  providerId,
  customerId,
  planId,
}) => ({
  brand: "Helpio Pay",
  type: "helpio_terminal_subscription_charge",
  subscriptionId: String(subscriptionId),
  providerId: providerId ? String(providerId) : "",
  customerId: customerId ? String(customerId) : "",
  planId: planId ? String(planId) : "",
});
