const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { toClient } = require('../utils/toClient');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userDoc = await User.findById(decoded.uid).lean();
    if (!userDoc) return res.status(401).json({ error: 'User not found' });
    const u = toClient(userDoc);
    req.user = {
      uid: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
    };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

module.exports = { auth, requireRole, JWT_SECRET };
