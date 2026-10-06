import { BadRequestException } from '@nestjs/common';

import { parseBulkCsv } from './parse-bulk-csv';

const file = (text: string, name = 'parents.csv') =>
  ({
    buffer: Buffer.from(text),
    originalname: name,
  }) as Express.Multer.File;

describe('parseBulkCsv', () => {
  it('normalizes headings and preserves quoted commas', async () => {
    const rows = await parseBulkCsv(
      file(
        'First Name,Last Name,Email,Home Address\nAda,Okafor,ada@example.com,"12, Main Street"\n',
      ),
    );
    expect(rows).toEqual([
      {
        first_name: 'Ada',
        last_name: 'Okafor',
        email: 'ada@example.com',
        home_address: '12, Main Street',
      },
    ]);
  });

  it.each([
    [undefined, 'missing file'],
    [file('a,b\n1,2', 'data.txt'), 'wrong extension'],
    [file('a,b\n'), 'empty data'],
  ])('rejects %s (%s)', async (upload) => {
    await expect(parseBulkCsv(upload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects more than 1000 data rows', async () => {
    const rows = [
      'Email',
      ...Array.from({ length: 1001 }, (_, i) => `user${i}@example.com`),
    ];
    await expect(parseBulkCsv(file(rows.join('\n')))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
