import jwt from 'jsonwebtoken';

/**
 * Generate JWT token
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Generate impersonation token for Super Admin
 */
export const generateImpersonationToken = (superAdminId, targetOrganizationId) => {
  return jwt.sign(
    {
      superAdminId,
      targetOrganizationId,
      isImpersonating: true
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

export default { generateToken, verifyToken, generateImpersonationToken };
