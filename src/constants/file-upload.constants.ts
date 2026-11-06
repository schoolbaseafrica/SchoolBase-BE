/**
 * File upload constants
 * Centralized constants for file upload size limits and allowed MIME types
 */

// File size limits in bytes
export const MAX_PICTURE_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_TEACHER_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_CLASSROOM_VOICE_NOTE_SIZE = 8 * 1024 * 1024; // 8MB
export const MAX_CLASSROOM_VOICE_NOTE_DURATION = 120; // seconds

// Allowed MIME types for image uploads
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
];

export const ALLOWED_AUDIO_MIME_TYPES: readonly string[] = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
];
