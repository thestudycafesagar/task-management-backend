import mongoose from 'mongoose';

/**
 * AuditLog Schema - Track super admin impersonation and critical actions
 */
const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'IMPERSONATION_START',
      'IMPERSONATION_END',
      'ORGANIZATION_CREATED',
      'ORGANIZATION_DISABLED',
      'ORGANIZATION_ENABLED',
      'USER_CREATED',
      'USER_DELETED',
      'PASSWORD_CHANGED',
      'PASSWORD_FORCE_CHANGED'
    ],
    index: true
  },
  targetOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Index for querying audit logs
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
