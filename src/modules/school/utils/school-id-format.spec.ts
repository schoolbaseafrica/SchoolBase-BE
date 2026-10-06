import { BadRequestException } from '@nestjs/common';

import { schoolIdPattern } from './school-id-format';

describe('schoolIdPattern', () => {
  it('renders the configured prefix, school code, year and padded sequence', () => {
    const pattern = schoolIdPattern(
      '{SCHOOL_CODE}-{PREFIX}-{YEAR_SHORT}-{SEQUENCE:4}',
      'STU',
      'ABC',
      4,
      2026,
    );
    expect(pattern.next(12)).toBe('ABC-STU-26-0012');
    expect(new RegExp(pattern.regex).exec('ABC-STU-26-0012')?.[1]).toBe('0012');
  });

  it('escapes punctuation in the regex for existing IDs', () => {
    const pattern = schoolIdPattern(
      '{PREFIX}.{YEAR}.{SEQUENCE}',
      'A+B',
      '',
      4,
      2026,
    );
    expect(new RegExp(pattern.regex).test('A+B.2026.9')).toBe(true);
    expect(new RegExp(pattern.regex).test('AAAB.2026.9')).toBe(false);
  });

  it.each(['ABC', '{YEAR}-{BOGUS}-{SEQUENCE}', '{SEQUENCE}-{SEQUENCE}'])(
    'rejects invalid pattern %s',
    (format) => {
      expect(() => schoolIdPattern(format, 'STU')).toThrow(BadRequestException);
    },
  );
});
