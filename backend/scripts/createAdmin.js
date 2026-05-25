require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function main() {
  const uri = process.env.MONGO_DB_URI;
  if (!uri) { console.error('MONGO_DB_URI not set in .env'); process.exit(1); }

  await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME || 'nacl-buget-intelligence' });

  const email = 'sanamhera@nacl.murugappa.com';
  const existing = await User.findOne({ email });
  if (existing) {
    existing.password = await bcrypt.hash('Nacl@123', 12);
    existing.role = 'Admin';
    existing.name = existing.name || 'Sanam Hera';
    await existing.save();
    console.log('Existing user updated → role: Admin, password reset.');
  } else {
    await User.create({
      email,
      password: await bcrypt.hash('Nacl@123', 12),
      name: 'Sanam Hera',
      role: 'Admin',
      createdAt: new Date(),
    });
    console.log('Admin user created successfully.');
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
