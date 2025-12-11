import Provider from "../models/Provider.js";

export const updateFeeOverride = async (req, res) => {
  try {
    const { id } = req.params;

    const provider = await Provider.findById(id);
    if (!provider)
      return res.status(404).json({ success: false, message: "Provider not found." });

    provider.providerFeeOverride = req.body;
    await provider.save();

    return res.json({
      success: true,
      message: "Provider fee override updated.",
      override: provider.providerFeeOverride,
    });
  } catch (err) {
    console.error("❌ updateFeeOverride error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
