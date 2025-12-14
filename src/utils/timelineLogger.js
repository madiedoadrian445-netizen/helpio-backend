// src/utils/timelineLogger.js
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import mongoose from "mongoose";
import Customer from "../models/Customer.js"; // Import Customer model

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const logCustomerTimelineEvent = async ({
  providerId,
  customerId,
  type,
  title,
  description = "",
  amount = null,
  invoice = null,
  subscription = null,
  subscriptionCharge = null,
}) => {
  if (!isValidId(providerId) || !isValidId(customerId)) return;

  // 1️⃣ Create timeline entry
  const entry = await CustomerTimeline.create({
    provider: providerId,
    customer: customerId,
    type,
    title,
    description,
    amount,
    ...(isValidId(invoice) && { invoice }),
    ...(isValidId(subscription) && { subscription }),
    ...(isValidId(subscriptionCharge) && { subscriptionCharge }),
  });

  // 2️⃣ Update fast CRM snapshot (NON-BLOCKING)
  try {
    await Customer.updateOne(
      { _id: customerId, provider: providerId },
      {
        lastInteractionType: type,
        lastInteractionAt: new Date(),
        lastContactAt: new Date(), // Ensure customer’s last contact is updated as well
      }
    );
  } catch (err) {
    console.error("Failed to update customer snapshot", err);
    // Never block timeline creation
  }

  return entry;
};
