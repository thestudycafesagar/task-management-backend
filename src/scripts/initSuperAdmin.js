import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Organization from '../models/Organization.js';

dotenv.config();

/**
 * Initialize Super Admin account
 */
const initSuperAdmin = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if super admin exists
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@platform.com';
    const existingSuperAdmin = await User.findOne({ email: superAdminEmail });

    if (existingSuperAdmin) {
      console.log('ℹ️  Super Admin already exists');
      process.exit(0);
    }

    // Create super admin
    const superAdmin = await User.create({
      role: 'SUPER_ADMIN',
      email: superAdminEmail,
      password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
      name: 'Super Admin',
      isActive: true
    });

    console.log('✅ Super Admin created successfully');
    console.log('Email:', superAdmin.email);
    console.log('Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

initSuperAdmin();
