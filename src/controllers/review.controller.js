import Review from "../models/Review.js";
import Listing from "../models/Listing.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
export const addReview = async (req, res, next) => {
  try {
    const {
      serviceId,
      providerId,
      conversationId,
      rating,
      comment,
      imageUrl
    } = req.body;

  const userId = req.user._id;

    if (!serviceId || !providerId || !conversationId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

// 🔒 Prevent reviewing your own listing
if (String(providerId) === String(req.user.providerId)) {
  return res.status(403).json({
    success: false,
    message: "You cannot review your own listing"
  });
}


// 🔒 Validate rating range
if (rating < 1 || rating > 5) {
  return res.status(400).json({
    success: false,
    message: "Rating must be between 1 and 5"
  });
}
    // 🔒 Verify conversation exists
    const convo = await Conversation.findById(conversationId);

    if (!convo) {
      return res.status(400).json({
        success: false,
        message: "Conversation not found"
      });
    }

   
// 🔒 Ensure the user participated in the conversation

const isParticipant =
  String(convo.customerId) === String(userId) ||
  String(convo.customerId) === String(req.user.providerId);

if (!isParticipant) {
  return res.status(403).json({
    success: false,
    message: "Unauthorized"
  });
}
// 🔒 Ensure the customer initiated the conversation

// 🔒 Ensure a message exists in the conversation
const messageExists = await Message.exists({
  conversationId
});

if (!messageExists) {
  return res.status(400).json({
    success: false,
    message: "You must contact the provider before leaving a review."
  });
}




    // 🔒 Prevent duplicate review
    const existing = await Review.findOne({
      conversation: conversationId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message:
          "A review already exists for this conversation."
      });
    }
// 🛡 Prevent review bombing (1 review per provider per 24h)



// ⭐ Enforce rating rules

if (rating <= 2) {
  if (!imageUrl || !comment || comment.trim().length < 14) {
    return res.status(400).json({
      success: false,
      message: "1-2 star reviews require a photo and explanation."
    });
  }
}

if (rating === 3) {
  if (!comment || comment.trim().length < 14) {
    return res.status(400).json({
      success: false,
      message: "3 star reviews require a short explanation."
    });
  }
}
    

    const review = await Review.create({
      service: serviceId,
      provider: providerId,
      user: userId,
      conversation: conversationId,
      rating,
      comment,
      imageUrl: imageUrl || null
    });

    // ⭐ Update listing rating stats
   const listing = await Listing.findById(serviceId);

if (!listing) {
  return res.status(404).json({
    success: false,
    message: "Listing not found"
  });
}
listing.ratingCount = (listing.ratingCount || 0) + 1;
listing.ratingSum = (listing.ratingSum || 0) + rating;
   listing.rating =
  Math.round((listing.ratingSum / listing.ratingCount) * 10) / 10;

    listing.ratingBreakdown[rating] =
      (listing.ratingBreakdown[rating] || 0) + 1;

    await listing.save();

    res.status(201).json({
      success: true,
      review
    });

  } catch (err) {
    next(err);
  }
};

export const listForService = async (req, res, next) => {
  try {
    const reviews = await Review.find({
      service: req.params.serviceId,
      status: "published"
    })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      reviews
    });

  } catch (err) {
    next(err);
  }
};

export const removeReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

  const isAuthor = String(review.user) === String(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to remove this review"
      });
    }

    review.status = "removed";
    await review.save();

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

export const checkReviewEligibility = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user._id;

    const convo = await Conversation.findOne({
  serviceId: serviceId,
  customerId: { $in: [userId, req.user.providerId] }
});
    if (!convo) {
      return res.json({
        eligible: false
      });
    }

   const messageExists = await Message.exists({
  conversationId: convo._id
});

if (!messageExists) {
  return res.json({
    eligible: false
  });
}

    return res.json({
      eligible: true,
      conversationId: convo._id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to check review eligibility"
    });
  }
};