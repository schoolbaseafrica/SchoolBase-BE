import { DataSource } from 'typeorm';

import { ClassService } from '../../class/services/class.service';

import { StudentBulkImportService } from './student-bulk-import.service';
import { StudentService } from './student.service';

describe('StudentBulkImportService', () => {
  const findOne = jest.fn();
  const query = jest.fn();
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ findOne }),
    query,
  };
  const students = { create: jest.fn(), update: jest.fn() };
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
    expect(result.results[0].error).toContain(
      'Row 2: Email is invalid. Example: ada@example.com',
    );
    expect(students.create).not.toHaveBeenCalled();
  });

  it('explains spreadsheet-damaged phone and date cells with their CSV row', async () => {
    const result = await service.import([
      { ...row, email: 'bad' },
      { ...row, phone: '8012345678', date_of_birth: '05/14/2012' },
    ]);
    expect(result).toMatchObject({ total: 2, successful: 0, failed: 2 });
    expect(result.results[1].error).toContain('Row 3:');
    expect(result.results[1].error).toContain('08012345678');
    expect(result.results[1].error).toContain('2012-05-14');
    expect(students.create).not.toHaveBeenCalled();
  });

  it('accepts a student CSV row without email', async () => {
    findOne.mockResolvedValue({ id: 'class-1' });
    students.create.mockResolvedValue({ id: 'student-1' });
    classes.assignStudentToClass.mockResolvedValue({});
    const result = await service.import([{ ...row, email: '' }]);
    expect(result).toMatchObject({ successful: 1, failed: 0 });
    expect(students.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: undefined }),
      undefined,
    );
  });

  it('previews an existing student update without changing blank columns', async () => {
    findOne.mockResolvedValue({
      id: 'student-1',
      user: { is_active: true, email: null, phone: '08011111111' },
    });
    const result = await service.previewUpdates([
      { registration_number: 'DEM0001', email: 'ada@example.com', phone: '' },
    ]);
    expect(result).toMatchObject({ ready: 1, failed: 0 });
    expect(result.results[0].changed_fields).toEqual(['email']);
    expect(students.update).not.toHaveBeenCalled();
  });

  it('recovers a unique registration number whose leading zeros were removed', async () => {
    query.mockResolvedValue([{ id: 'student-1', registration_number: '0044' }]);
    findOne.mockResolvedValue({
      id: 'student-1',
      registration_number: '0044',
      user: { is_active: true, phone: '08011111111' },
    });
    const preview = await service.previewUpdates([
      { registration_number: '44', phone: '08022222222' },
    ]);
    expect(preview).toMatchObject({ ready: 1, failed: 0 });
    expect(preview.results[0]).toMatchObject({
      registration_number: '44',
      matched_registration_number: '0044',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ltrim'), [
      '44',
    ]);
    expect(students.update).not.toHaveBeenCalled();
  });

  it('blocks an ambiguous numeric registration number even if one exact match exists', async () => {
    query.mockResolvedValue([
      { id: 'student-1', registration_number: '44' },
      { id: 'student-2', registration_number: '0044' },
    ]);
    const result = await service.updateExisting(
      [{ registration_number: '44', phone: '08022222222' }],
      'admin-1',
    );
    expect(result).toMatchObject({ updated: 0, failed: 1 });
    expect(result.results[0].error).toContain('multiple students');
    expect(findOne).not.toHaveBeenCalled();
    expect(students.update).not.toHaveBeenCalled();
  });

  it('uses an exact registration number with leading zeros when similar numbers exist', async () => {
    findOne.mockResolvedValue({
      id: 'student-2',
      registration_number: '0044',
      user: { is_active: true, phone: '08011111111' },
    });
    const preview = await service.previewUpdates([
      { registration_number: '0044', phone: '08022222222' },
    ]);
    expect(preview).toMatchObject({ ready: 1, failed: 0 });
    expect(preview.results[0].matched_registration_number).toBe('0044');
    expect(query).not.toHaveBeenCalled();
  });

  it('blocks all updates if the file contains an unmatched student', async () => {
    findOne
      .mockResolvedValueOnce({
        id: 'student-1',
        user: { is_active: true, phone: '08011111111' },
      })
      .mockResolvedValueOnce(null);
    const result = await service.updateExisting(
      [
        { registration_number: 'DEM0001', phone: '08022222222' },
        { registration_number: 'MISSING', phone: '08033333333' },
      ],
      'admin-1',
    );
    expect(result).toMatchObject({ updated: 0, failed: 1 });
    expect(students.update).not.toHaveBeenCalled();
  });

  it('rejects unsupported populated columns instead of silently ignoring them', async () => {
    const result = await service.previewUpdates([
      { registration_number: 'DEM0001', nickname: 'Ada' },
    ]);
    expect(result).toMatchObject({ ready: 0, failed: 1 });
    expect(result.results[0].error).toContain('nickname');
    expect(students.update).not.toHaveBeenCalled();
  });

  it('previews and assigns an unassigned student to an existing current-session class', async () => {
    const student = { id: 'student-1', user: { is_active: true } };
    const targetClass = {
      id: 'class-1',
      name: 'JSS 1',
      arm: 'A',
      academicSession: { id: 'session-1' },
    };
    findOne
      .mockResolvedValueOnce(student)
      .mockResolvedValueOnce(targetClass)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(student)
      .mockResolvedValueOnce(targetClass)
      .mockResolvedValueOnce(null);
    classes.assignStudentToClass.mockResolvedValue({});
    const rows = [{ registration_number: 'DEM0001', class: 'Jss 1', arm: 'a' }];
    const preview = await service.previewUpdates(rows);
    expect(preview).toMatchObject({ ready: 1, failed: 0 });
    expect(preview.results[0].changed_fields).toEqual(['class']);
    expect(classes.assignStudentToClass).not.toHaveBeenCalled();
    const result = await service.updateExisting(rows, 'admin-1');
    expect(result).toMatchObject({ updated: 1, failed: 0 });
    expect(classes.assignStudentToClass).toHaveBeenCalledWith(
      'class-1',
      'student-1',
    );
    expect(students.update).not.toHaveBeenCalled();
  });

  it('does not replace a current-session class through CSV update', async () => {
    findOne
      .mockResolvedValueOnce({ id: 'student-1', user: { is_active: true } })
      .mockResolvedValueOnce({
        id: 'new-class',
        academicSession: { id: 'session-1' },
      })
      .mockResolvedValueOnce({
        class: { id: 'old-class', name: 'JSS 1', arm: 'B' },
      });
    const result = await service.previewUpdates([
      { registration_number: 'DEM0001', class: 'JSS 1', arm: 'A' },
    ]);
    expect(result).toMatchObject({ ready: 0, failed: 1 });
    expect(result.results[0].error).toContain('already assigned');
  });

  it('updates only supplied nonempty fields and records the actor', async () => {
    findOne.mockResolvedValue({
      id: 'student-1',
      user: { is_active: true, phone: '08011111111' },
    });
    students.update.mockResolvedValue({});
    const result = await service.updateExisting(
      [{ registration_number: 'DEM0001', phone: '08022222222', email: '' }],
      'admin-1',
    );
    expect(result).toMatchObject({ updated: 1, failed: 0 });
    expect(students.update).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({ phone: '08022222222' }),
      'admin-1',
    );
    expect(students.update.mock.calls[0][1]).not.toHaveProperty('email');
  });
});
