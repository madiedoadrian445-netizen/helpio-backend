// src/cron/monthlyStatementsCron.js
import cron from "node-cron";
import { FinancialStatement } from "../models/FinancialStatement.js";
import Provider from "../models/Provider.js";
import {
  computeAndPersistMonthlyStatement,
} from "../utils/financialStatements.js";

/**
 * Monthly financial statement cron
 *
 * Runs on the 1st of every month at 2:15 AM UTC.
 * Generates statements for ALL providers for the previous month.
 */
export const runMonthlyStatementsCron = () => {
  console.log("📄 [Cron] MonthlyStatementsCron initialized.");

  // “0 15 2 1 * *” = minute 15, hour 2, day 1, every month
  cron.schedule("15 2 1 * *", async () => {
    console.log("📄 [Cron] Running Monthly Financial Statements generation...");

    try {
      const now = new Date();
      let year = now.getUTCFullYear();
      let month = now.getUTCMonth(); // previous month in 0–11

      // If month = 0, that means January -> generate for December last year
      if (month === 0) {
        month = 12;
        year = year - 1;
      }

      const providers = await Provider.find({ isActive: true }).lean();

      console.log(`📄 [Cron] Found ${providers.length} active providers.`);

      for (const provider of providers) {
        try {
          await computeAndPersistMonthlyStatement({
            providerId: provider._id,
            year,
            month,
            currency: "usd",
            metadata: {
              generatedBy: "system",
              source: "cron:monthly-statements",
              notes: "Automated monthly statement",
            },
          });

          console.log(
            `📄 [Cron] Statement generated for provider ${provider._id} (${month}/${year}).`
          );
        } catch (err) {
          console.error(
            `❌ [Cron] Failed statement for provider ${provider._id}:`,
            err.message
          );
        }
      }

      console.log("📄 [Cron] Monthly Financial Statements complete.");
    } catch (err) {
      console.error("❌ [Cron] MonthlyStatementsCron fatal error:", err);
    }
  });
};
