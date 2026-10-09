import { BadRequestException } from '@nestjs/common';

const placeholder =
  /\{(YEAR|YEAR_SHORT|PREFIX|SCHOOL_CODE|SEQUENCE(?::([1-9]\d?))?)\}/g;

export function schoolIdPattern(
  format: string | null | undefined,
  prefix: string,
  schoolCode = '',
  defaultWidth = 4,
  year = new Date().getFullYear(),
) {
  const source = format?.trim() || `{PREFIX}-{YEAR}-{SEQUENCE:${defaultWidth}}`;
  let sequenceCount = 0;
  let width = defaultWidth;
  const rendered = source.replace(
    placeholder,
    (_match, name: string, digits?: string) => {
      if (name.startsWith('SEQUENCE')) {
        sequenceCount++;
        width = digits ? Number(digits) : 1;
        return '\u0000';
      }
      if (name === 'YEAR') return String(year);
      if (name === 'YEAR_SHORT') return String(year).slice(-2);
      if (name === 'PREFIX') return prefix;
      return schoolCode;
    },
  );
  if (
    sequenceCount !== 1 ||
    /[{}]/.test(rendered) ||
    !/^[^\u0000]*\u0000[^\u0000]*$/.test(rendered)
  ) {
    throw new BadRequestException(
      'ID format must contain one {SEQUENCE} placeholder and only supported placeholders',
    );
  }
  if (source.includes('{SCHOOL_CODE}') && !schoolCode) {
    throw new BadRequestException(
      'Set a school code before using {SCHOOL_CODE} in an ID format',
    );
  }
  const [before, after] = rendered.split('\u0000');
  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = `^${escapeRegex(before)}([0-9]+)${escapeRegex(after)}$`;
  return {
    regex,
    next: (sequence: number) =>
      `${before}${String(sequence).padStart(width, '0')}${after}`,
  };
}
