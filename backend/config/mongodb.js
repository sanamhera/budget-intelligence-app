const mongoose = require('mongoose');

/** Default matches requested database name (spelling preserved). Override with MONGO_DB_NAME. */
const DEFAULT_DB_NAME = 'nacl-buget-intelligence';

async function connectMongo() {
  const uri = process.env.MONGO_DB_URI;
  if (!uri || !String(uri).trim()) {
    throw new Error('MONGO_DB_URI must be set in the environment (e.g. backend/.env)');
  }
  const dbName = process.env.MONGO_DB_NAME || DEFAULT_DB_NAME;
  await mongoose.connect(uri, { dbName });
  console.log(`MongoDB connected (database: ${dbName})`);
}

module.exports = { connectMongo, mongoose, DEFAULT_DB_NAME };
