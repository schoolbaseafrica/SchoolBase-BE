import * as crypto from 'crypto';

export function generateResetToken(hours: number = 1): {
  resetToken: string;
  resetTokenExpiry: Date;
} {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000 * hours); // 1 hour expiry
  return { resetToken, resetTokenExpiry };
}
