const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/firebase');
const { auth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const ROLES = ['Admin', 'Requestor', 'Approver', 'Finance'];

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: 'Invalid credentials' });
    const doc = snap.docs[0];
    const user = { uid: doc.id, ...doc.data() };
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: doc.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty(),
  body('role').isIn(ROLES),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, name, role } = req.body;
    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already exists' });
    const ref = await db.collection('users').add({ email, password, name, role, createdAt: new Date() });
    const token = jwt.sign({ uid: ref.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { uid: ref.id, email, name, role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', auth, (req, res) => {
  const { password, ...user } = req.user;
  res.json(user);
});

module.exports = router;
