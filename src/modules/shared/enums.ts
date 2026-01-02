export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
}

export enum ClassLevel {
  NURSERY = 'Nursery',
  PRIMARY = 'Primary',
  JUNIOR_SECONDARY = 'Junior Secondary',
  SENIOR_SECONDARY = 'Senior Secondary',
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
  OTHER = 'Other',
}

export enum FeeNotificationType {
  CREATED = 'created',
  UPDATED = 'updated',
  ACTIVATED = 'activated',
  DEACTIVATED = 'deactivated',
}

// school setup status
export enum SetupPhase {
  SCHOOL_INFO = 'school_info',
  LANDING_PAGE = 'landing_page',
  SUPERADMIN = 'superadmin',
}
