import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * User Schema - Multi-tenant user model with role-based access
 */
const userSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: function() {
      return this.role !== 'SUPER_ADMIN';
    },
    index: true
  },
  role: {
    type: String,
    required: [true, 'User role is required'],
    default: 'EMPLOYEE',
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  fcmTokens: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  notificationSettings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    taskAssigned: {
      type: Boolean,
      default: true
    },
    taskUpdated: {
      type: Boolean,
      default: true
    },
    taskCompleted: {
      type: Boolean,
      default: true
    }
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.fcmTokens;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
