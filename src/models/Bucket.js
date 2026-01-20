import mongoose from 'mongoose';

/**
 * Bucket Schema - Organization-specific task categorization
 */
const bucketSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Bucket name is required'],
    trim: true,
    maxlength: [100, 'Bucket name cannot exceed 100 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Ensure bucket names are unique within an organization
bucketSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Compound index for efficient queries
bucketSchema.index({ organizationId: 1, isDeleted: 1 });

const Bucket = mongoose.model('Bucket', bucketSchema);

export default Bucket;
