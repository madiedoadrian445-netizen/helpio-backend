// src/controllers/service.controller.js
const Service = require('../models/Service');

exports.list = async (req, res, next) => {
  try {
    const {
      q = '',
      min,
      max,
      sort = 'new',          // new | plow | phigh | dist
      lat,
      lng,
      radiusKm,              // e.g. 25
    } = req.query;

    const priceFilter = {};
    if (min !== undefined) priceFilter.$gte = Number(min);
    if (max !== undefined) priceFilter.$lte = Number(max);

    const matchStage = {};
    if (Object.keys(priceFilter).length) matchStage.price = priceFilter;
    if (q) matchStage.$text = { $search: q };

    const pipeline = [];

    // If we have lat/lng + radius, use $geoNear first in pipeline
    const haveGeo = lat !== undefined && lng !== undefined && radiusKm !== undefined;

    if (haveGeo) {
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance: Number(radiusKm) * 1000,
          query: matchStage, // apply price/text filters inside geoNear
        },
      });
    } else {
      // No geo: normal match
      if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });
    }

    // Sorting
    let sortStage = {};
    if (sort === 'plow') sortStage = { price: 1, createdAt: -1 };
    else if (sort === 'phigh') sortStage = { price: -1, createdAt: -1 };
    else if (sort === 'dist' && haveGeo) sortStage = { distanceMeters: 1 };
    else sortStage = { createdAt: -1 }; // "new"

    pipeline.push({ $sort: sortStage });

    // (optional) limit/paging
    pipeline.push({ $limit: 200 });

    const items = await Service.aggregate(pipeline);

    res.json(items);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const {
      title, description, price, category, location,
      lat, lng, // NEW optional
      photos = [],
    } = req.body;

    const payload = {
      title, description, price, category, location, photos,
      provider: req.user.id,
    };

    if (lat !== undefined && lng !== undefined) {
      payload.geo = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    }

    const doc = await Service.create(payload);
    res.status(201).json(doc);
  } catch (e) { next(e); }
};
