import mongoose from 'mongoose';

/**
 * Generate a random alphanumeric string
 */
function generateRandomSuffix(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Organization Schema - Multi-tenant organization model
 */
const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxlength: [100, 'Organization name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  customRoles: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate unique slug from name before validation
organizationSchema.pre('validate', async function(next) {
  if (this.name && !this.slug) {
    // Generate base slug from name
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Check if slug exists
    let slug = baseSlug;
    let suffix = generateRandomSuffix(4);
    slug = `${baseSlug}-${suffix}`;
    
    // Keep generating until we find a unique slug
    let exists = await mongoose.model('Organization').findOne({ slug });
    while (exists) {
      suffix = generateRandomSuffix(4);
      slug = `${baseSlug}-${suffix}`;
      exists = await mongoose.model('Organization').findOne({ slug });
    }
    
    this.slug = slug;
  }
  next();
});

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
