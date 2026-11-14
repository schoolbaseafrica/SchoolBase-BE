import { IRequestWithUser } from '../../../common/types';
import { UserRole } from '../../shared/enums';
import { ListClassSubjectQueryDto } from '../dto';
import { ClassSubjectService } from '../services';
import { StudentSubjectEnrollmentService } from '../services/student-subject-enrollment.service';

import { ClassSubjectController } from './class-subject.controller';

describe('ClassSubjectController role filtering', () => {
  const list = jest.fn().mockResolvedValue({ payload: [] });
  const controller = new ClassSubjectController(
    { list } as unknown as ClassSubjectService,
    {} as StudentSubjectEnrollmentService,
  );
  const request = (roles: UserRole[]) =>
    ({ user: { roles, teacher_id: 'teacher-1' } }) as IRequestWithUser;

  beforeEach(() => list.mockClear());

  it('lets an admin with teacher role see the whole class', async () => {
    const query = { class_id: 'class-1' } as ListClassSubjectQueryDto;
    await controller.list(request([UserRole.ADMIN, UserRole.TEACHER]), query);
    expect(list).toHaveBeenCalledWith({ class_id: 'class-1' });
  });

  it('still limits a teacher-only account to its subjects', async () => {
    const query = { class_id: 'class-1' } as ListClassSubjectQueryDto;
    await controller.list(request([UserRole.TEACHER]), query);
    expect(list).toHaveBeenCalledWith({
      class_id: 'class-1',
      teacher_id: 'teacher-1',
    });
  });
});
