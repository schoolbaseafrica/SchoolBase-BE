// Subject-based attendance (per period/schedule)
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

// Student daily attendance (overall day)
export enum DailyAttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
  HALF_DAY = 'HALF_DAY',
}

// Edit request status
export enum EditRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Attendance type
export enum AttendanceType {
  SCHEDULE_BASED = 'SCHEDULE_BASED',
  DAILY = 'DAILY',
}
