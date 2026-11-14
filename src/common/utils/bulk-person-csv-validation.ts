import { ValidationError } from 'class-validator';

const examples: Record<string, string> = {
  first_name: 'Ada',
  last_name: 'Okafor',
  middle_name: 'Chinelo',
  email: 'ada@example.com',
  phone: '08012345678 or +2348012345678',
  registration_number: 'REG-0014',
  gender: 'Female',
  home_address: '12 Market Road, Lagos',
  password: 'ReplaceThis123!',
};

const fieldName = (property: string) =>
  property.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

export function bulkPersonCsvErrors(
  row: Record<string, string>,
  validationErrors: ValidationError[],
  dateExample = '2012-05-14',
): string[] {
  const errors = new Map<string, string>();

  for (const error of validationErrors) {
    const example =
      error.property === 'date_of_birth'
        ? `${dateExample} (YYYY-MM-DD)`
        : examples[error.property];
    errors.set(
      error.property,
      `${fieldName(error.property)} is invalid${example ? `. Example: ${example}` : ''}`,
    );
  }

  const date = row.date_of_birth;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.set(
      'date_of_birth',
      `Date of Birth must be YYYY-MM-DD. Example: ${dateExample}`,
    );
  } else if (date) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      errors.set(
        'date_of_birth',
        `Date of Birth is not a real date. Example: ${dateExample}`,
      );
    }
  }

  const phone = row.phone?.replace(/[\s()-]/g, '');
  if (phone && !/^(?:0\d{10}|\+?234\d{10}|\+[1-9]\d{7,14})$/.test(phone)) {
    errors.set(
      'phone',
      'Phone must include its leading 0 or country code. Example: 08012345678 or +2348012345678',
    );
  }

  return [...errors.values()];
}
