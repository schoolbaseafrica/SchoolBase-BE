import { isWithinLessonSlot } from './lesson-slot';

describe('lesson timetable slot', () => {
  const monday = { day: 'MONDAY', startTime: '09:00:00', endTime: '10:00:00' };

  it('is live only within the scheduled day and time in Lagos', () => {
    expect(isWithinLessonSlot(monday, new Date('2026-10-12T08:30:00Z'))).toBe(
      true,
    );
    expect(isWithinLessonSlot(monday, new Date('2026-10-12T07:59:00Z'))).toBe(
      false,
    );
    expect(isWithinLessonSlot(monday, new Date('2026-10-12T09:00:00Z'))).toBe(
      false,
    );
    expect(isWithinLessonSlot(monday, new Date('2026-10-13T08:30:00Z'))).toBe(
      false,
    );
  });
});
