import { bulkPersonCsvErrors } from './bulk-person-csv-validation';

describe('bulkPersonCsvErrors', () => {
  it('accepts date and phone values from the downloadable CSV sample', () => {
    expect(
      bulkPersonCsvErrors(
        { date_of_birth: '2012-05-14', phone: '08012345678' },
        [],
      ),
    ).toEqual([]);
    expect(
      bulkPersonCsvErrors(
        { date_of_birth: '2012-05-14', phone: '+2348012345678' },
        [],
      ),
    ).toEqual([]);
  });

  it('rejects spreadsheet-altered dates and phone numbers with examples', () => {
    const errors = bulkPersonCsvErrors(
      { date_of_birth: '14/05/2012', phone: '8012345678' },
      [],
    );
    expect(errors.join(' ')).toContain('YYYY-MM-DD');
    expect(errors.join(' ')).toContain('08012345678');
  });

  it('rejects impossible calendar dates', () => {
    expect(
      bulkPersonCsvErrors(
        { date_of_birth: '2012-02-30', phone: '08012345678' },
        [],
      ),
    ).toContain('Date of Birth is not a real date. Example: 2012-05-14');
  });
});
