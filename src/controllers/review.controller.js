// src/controllers/review.controller.js
const Review = require('../models/Review');
const Service = require('../models/Service');

exports.addReview = async (req, res, next) => {
  try {
    const { service, rating, comment } = req.body;

    // create review
    const doc = await Review.create({
      service,
      rating,
      comment,
      user: req.user.id,
    });

    // recompute rating on the service (simple average)
    const agg = await Review.aggregate([
      { $match: { service: doc.service } },
      { $group: { _id: '$service', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
    ]);

    if (agg[0]) {
      await Service.findByIdAndUpdate(doc.service, {
        avgRating: Math.round(agg[0].avgRating * 10) / 10,
        reviewCount: agg[0].reviewCount
      });
    }

    res.status(201).json(doc);
  } catch (e) { next(e); }
};

exports.listForService = async (req, res, next) => {
  try {
    const items = await Review.find({ service: req.params.serviceId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (e) { next(e); }
};

exports.removeReview = async (req, res, next) => {
  try {
    await Review.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.status(204).end();
  } catch (e) { next(e); }
};
