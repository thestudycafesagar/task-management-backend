import mongoose from 'mongoose';

/**
 * Task Schema - Multi-tenant task model
 */
const taskSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Task title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Task description cannot exceed 2000 characters']
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM',
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'OVERDUE'],
    default: 'PENDING',
    index: true
  },
  dueDate: {
    type: Date,
    default: null,
    index: true
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bucketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bucket',
    default: null,
    index: true
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  // Time tracking fields
  acceptedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  submittedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  timeSpentMinutes: {
    type: Number,
    default: 0
  },
  // Submission details
  submissionNote: {
    type: String,
    trim: true,
    maxlength: [1000, 'Submission note cannot exceed 1000 characters']
  },
  adminFeedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Admin feedback cannot exceed 1000 characters']
  },
  // Comments for two-way communication
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Compound index for efficient queries
taskSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
taskSchema.index({ organizationId: 1, assignedTo: 1, status: 1 });

// Calculate time spent when task is completed or submitted
taskSchema.pre('save', function(next) {
  // Set completedAt when status changes to COMPLETED
  if (this.isModified('status') && this.status === 'COMPLETED' && !this.completedAt) {
    this.completedAt = new Date();
    
    // Calculate time spent from startedAt to completedAt
    if (this.startedAt) {
      const timeDiff = this.completedAt - this.startedAt;
      this.timeSpentMinutes = Math.round(timeDiff / (1000 * 60));
    }
  }
  
  // Set startedAt when status changes to IN_PROGRESS
  if (this.isModified('status') && this.status === 'IN_PROGRESS' && !this.startedAt) {
    this.startedAt = new Date();
  }
  
  // Set acceptedAt when status changes to ACCEPTED
  if (this.isModified('status') && this.status === 'ACCEPTED' && !this.acceptedAt) {
    this.acceptedAt = new Date();
  }
  
  // Set submittedAt when status changes to SUBMITTED
  if (this.isModified('status') && this.status === 'SUBMITTED' && !this.submittedAt) {
    this.submittedAt = new Date();
    
    // Calculate time spent if started
    if (this.startedAt) {
      const timeDiff = this.submittedAt - this.startedAt;
      this.timeSpentMinutes = Math.round(timeDiff / (1000 * 60));
    }
  }
  
  next();
});

const Task = mongoose.model('Task', taskSchema);

export default Task;
