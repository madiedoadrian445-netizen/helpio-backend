// src/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * auth(required = true, roles = [])
 * - required = true -> reject if no/invalid token
 * - required = false -> token optional; sets req.user if present/valid
 * - roles -> if provided, user.role must be in roles
 */
exports.auth = (required = true, roles = []) => {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;

    if (!token) {
      if (required) return res.status(401).json({ error: 'No token' });
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
      req.user = { id: decoded.id, role: decoded.role };

      if (roles.length && !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      next();
    } catch (e) {
      if (required) return res.status(401).json({ error: 'Invalid token' });
      req.user = null;
      next();
    }
  };
};

// For convenience if you ever want the old name:
exports.protect = exports.auth(true);
exports.requireRoles = (...roles) => exports.auth(true, roles);
