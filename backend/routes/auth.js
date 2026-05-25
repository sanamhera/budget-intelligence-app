const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { auth, requireRole, JWT_SECRET } = require('../middleware/auth');
const { toClient } = require('../utils/toClient');

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
    const userDoc = await User.findOne({ email });
    if (!userDoc) return res.status(401).json({ error: 'Invalid credentials' });

    const storedPw = userDoc.password;
    const isHashed = storedPw.startsWith('$2');
    let valid = false;
    if (isHashed) {
      valid = await bcrypt.compare(password, storedPw);
    } else {
      valid = storedPw === password;
      if (valid) {
        userDoc.password = await bcrypt.hash(password, 12);
        await userDoc.save();
      }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const uid = String(userDoc._id);
    const user = { uid, ...userDoc.toObject(), _id: undefined };
    const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: '7d' });
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, name } = req.body;
    const role = 'Requestor'; // public registration is always Requestor
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const created = await User.create({ email, password: hashedPassword, name, role, createdAt: new Date() });
    const uid = String(created._id);
    const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { uid, email, name, role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin-only: list all users ───────────────────────────────
router.get('/users', auth, requireRole('Admin'), async (req, res) => {
  try {
    const users = await User.find().lean().select('-password');
    res.json(users.map(u => ({ id: String(u._id), email: u.email, name: u.name, role: u.role, department: u.department || '', createdAt: u.createdAt })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin-only: create user with any role ────────────────────
router.post('/users', auth, requireRole('Admin'), [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty(),
  body('role').isIn(ROLES),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, name, role, department } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const created = await User.create({ email, password: hashedPassword, name, role, department: department || '', createdAt: new Date() });
    res.status(201).json({ id: String(created._id), email, name, role, department: created.department });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin-only: update user role / department ────────────────
router.patch('/users/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.role !== undefined) {
      if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Invalid role' });
      user.role = req.body.role;
    }
    if (req.body.department !== undefined) user.department = req.body.department;
    await user.save();
    res.json({ id: String(user._id), email: user.email, name: user.name, role: user.role, department: user.department || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin-only: delete user ──────────────────────────────────
router.delete('/users/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.uid) return res.status(400).json({ error: 'Cannot delete your own account' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
