const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return res.status(401).json({ error: 'User not found' });
    req.user = { uid: decoded.uid, ...userSnap.data() };
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
