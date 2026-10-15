import { Readable } from 'stream';

import { BadRequestException } from '@nestjs/common';
import * as csvParser from 'csv-parser';

export async function parseBulkCsv(
  file?: Express.Multer.File,
): Promise<Record<string, string>[]> {
  if (!file?.buffer || !file.originalname.toLowerCase().endsWith('.csv')) {
    throw new BadRequestException('Choose a CSV file');
  }
  if (file.buffer.length > 5 * 1024 * 1024) {
    throw new BadRequestException('CSV file must be 5 MB or smaller');
  }
  const rows: Record<string, string>[] = [];
  await new Promise<void>((resolve, reject) => {
    Readable.from(file.buffer)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) =>
            header
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, ''),
        }),
      )
      .on('data', (row: Record<string, string>) => {
        if (rows.length >= 1000) {
          reject(new BadRequestException('CSV files are limited to 1000 rows'));
          return;
        }
        rows.push(
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              String(value ?? '').trim(),
            ]),
          ),
        );
      })
      .on('end', resolve)
      .on('error', reject);
  });
  if (!rows.length) throw new BadRequestException('CSV file has no rows');
  return rows;
}
