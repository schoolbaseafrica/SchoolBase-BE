import { DataSource } from 'typeorm';

import { ClassService } from '../../class/services/class.service';

import { StudentBulkImportService } from './student-bulk-import.service';
import { StudentService } from './student.service';

describe('StudentBulkImportService', () => {
  const findOne = jest.fn();
  const dataSource = { getRepository: jest.fn().mockReturnValue({ findOne }) };
  const students = { create: jest.fn() };
  const classes = { assignStudentToClass: jest.fn() };
  const service = new StudentBulkImportService(
    dataSource as unknown as DataSource,
    students as unknown as StudentService,
    classes as unknown as ClassService,
  );
  const row = {
    first_name: 'Ada',
    last_name: 'Okafor',
    email: 'ada@example.com',
    phone: '+2348012345678',
    date_of_birth: '2010-01-01',
    gender: 'Female',
    password: 'LongPassword1',
    class: 'JSS 1',
    arm: 'A',
  };

  beforeEach(() => jest.clearAllMocks());

  it('reports missing classes before importing', async () => {
    findOne.mockResolvedValue(null);
    expect(
      await service.validateClasses([
        row,
        { ...row, email: 'two@example.com' },
      ]),
    ).toEqual({
      missing_classes: [{ name: 'JSS 1', arm: 'A', student_count: 2 }],
      existing_classes: [],
    });
    expect(students.create).not.toHaveBeenCalled();
  });

  it('creates and assigns a valid student to an existing class', async () => {
    findOne.mockResolvedValue({ id: 'class-1' });
    students.create.mockResolvedValue({ id: 'student-1' });
    classes.assignStudentToClass.mockResolvedValue({});
    const result = await service.import([row], 'admin-1');
    expect(result).toMatchObject({ total: 1, successful: 1, failed: 0 });
    expect(students.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: row.email }),
      'admin-1',
    );
    expect(classes.assignStudentToClass).toHaveBeenCalledWith(
      'class-1',
      'student-1',
    );
  });

  it('finds the class created from a mixed-case CSV row', async () => {
    findOne.mockResolvedValue({ id: 'class-1' });
    students.create.mockResolvedValue({ id: 'student-1' });
    classes.assignStudentToClass.mockResolvedValue({});

    const result = await service.import([
      { ...row, class: '  Jss   1  ', arm: ' a ' },
    ]);

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: 'JSS 1', arm: 'A' }),
      }),
    );
    expect(classes.assignStudentToClass).toHaveBeenCalledWith(
      'class-1',
      'student-1',
    );
    expect(result).toMatchObject({ total: 1, successful: 1, failed: 0 });
  });

  it('rejects invalid rows before creating accounts', async () => {
    const result = await service.import([{ ...row, email: 'bad' }]);
    expect(result).toMatchObject({ total: 1, successful: 0, failed: 1 });
    expect(students.create).not.toHaveBeenCalled();
  });
});
