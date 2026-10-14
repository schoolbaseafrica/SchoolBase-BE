export interface ILessonSlot {
  day: string;
  startTime: string;
  endTime: string;
}

// SchoolBase currently stores timetable times in the school's Nigerian local time.
export function isWithinLessonSlot(slot: ILessonSlot, at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = value('weekday').toUpperCase();
  const minute = Number(value('hour')) * 60 + Number(value('minute'));
  const start = slot.startTime.split(':').map(Number);
  const end = slot.endTime.split(':').map(Number);
  return (
    day === slot.day.toUpperCase() &&
    minute >= start[0] * 60 + start[1] &&
    minute < end[0] * 60 + end[1]
  );
}
