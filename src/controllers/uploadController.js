// src/controllers/uploadController.js
export const uploadImage = async (req, res) => {
  try {
    return res.json({
      success: true,
      url: req.file.path, // Cloudinary URL
    });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};

export const uploadImages = async (req, res) => {
  try {
    const urls = req.files.map((file) => file.path);

    return res.json({
      success: true,
      urls,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};
