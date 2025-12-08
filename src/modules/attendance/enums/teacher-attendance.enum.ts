export enum TeacherDailyAttendanceStatusEnum {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
  HALF_DAY = 'HALF_DAY',
}

export enum TeacherDailyAttendanceSourceEnum {
  MANUAL = 'MANUAL',
  AUTOMATED = 'AUTOMATED',
}

export enum TeacherDailyAttendanceDecisionEnum {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Teacher manual checkin status
export enum TeacherManualCheckinStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
