import mongoose from 'mongoose';
import config from './index.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: config.env === 'test' ? 1000 : 5000,
    });
    if (config.env !== 'test') {
      console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    }
    return conn;
  } catch (error) {
    if (config.env === 'test') {
      throw error;
    }
    console.error(`MongoDB connection error: ${error.message}`);
    if (config.env === 'production') {
      process.exit(1);
    }
  }
};

export default connectDB;
