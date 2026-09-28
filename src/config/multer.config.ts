import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PICTURE_UPLOAD_SIZE,
  MAX_TEACHER_PHOTO_SIZE,
  MAX_CLASSROOM_VOICE_NOTE_SIZE,
  ALLOWED_AUDIO_MIME_TYPES,
} from '../constants/file-upload.constants';

export const teacherPhotoConfig: MulterOptions = {
  storage: memoryStorage(), // Store in memory for processing with sharp
  limits: {
    fileSize: MAX_TEACHER_PHOTO_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'),
        false,
      );
    }
  },
};

export const classroomVoiceNoteConfig: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_CLASSROOM_VOICE_NOTE_SIZE },
  fileFilter: (req, file, cb) => {
    const mimeType = file.mimetype.split(';')[0].toLowerCase();
    if (ALLOWED_AUDIO_MIME_TYPES.includes(mimeType)) cb(null, true);
    else
      cb(
        new Error('Voice notes must be WebM, OGG, MP4, MP3, or WAV audio.'),
        false,
      );
  },
};

export const pictureUploadConfig: MulterOptions = {
  storage: memoryStorage(), // Store in memory for MinIO upload
  limits: {
    fileSize: MAX_PICTURE_UPLOAD_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'),
        false,
      );
    }
  },
};
