import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { writeActivityLog } from '../../activity-log/write-activity-log';

type ClassSubjectRow = {
  id: string;
  class_id: string;
  subject_id: string;
  session_id: string;
  is_elective: boolean;
};

@Injectable()
export class StudentSubjectEnrollmentService {
  constructor(private readonly dataSource: DataSource) {}

  private async getClassSubject(
    manager: EntityManager,
    classSubjectId: string,
    lock = false,
  ): Promise<ClassSubjectRow> {
    const rows: ClassSubjectRow[] = await manager.query(
      `SELECT cs.id, cs.class_id, cs.subject_id, c.academic_session_id AS session_id, cs.is_elective
       FROM class_subjects cs JOIN class c ON c.id = cs.class_id
       WHERE cs.id = $1 AND c.is_deleted IS NOT TRUE
       ${lock ? 'FOR UPDATE OF cs' : ''}`,
      [classSubjectId],
    );
    if (!rows.length) throw new NotFoundException('Class subject not found');
    return rows[0];
  }

  private async assertTerm(
    manager: EntityManager,
    termId: string,
    sessionId: string,
  ): Promise<void> {
    const terms = await manager.query(
      `SELECT id FROM terms WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL`,
      [termId, sessionId],
    );
    if (!terms.length)
      throw new BadRequestException(
        'Term does not belong to this class session',
      );
  }

  private async assertNoRecordedScores(
    manager: EntityManager,
    subject: ClassSubjectRow,
    termId?: string,
  ): Promise<void> {
    const submissions = await manager.query(
      `SELECT 1 FROM grade_submissions WHERE class_id = $1 AND subject_id = $2
       ${termId ? 'AND term_id = $3' : ''} LIMIT 1`,
      termId
        ? [subject.class_id, subject.subject_id, termId]
        : [subject.class_id, subject.subject_id],
    );
    const published = await manager.query(
      `SELECT 1 FROM result_subject_lines l JOIN results r ON r.id = l.result_id
       WHERE r.class_id = $1 AND l.subject_id = $2
       ${termId ? 'AND r.term_id = $3' : ''} LIMIT 1`,
      termId
        ? [subject.class_id, subject.subject_id, termId]
        : [subject.class_id, subject.subject_id],
    );
    if (submissions.length || published.length)
      throw new ConflictException(
        'Scores or results already exist for this subject and term. Correct those records before changing enrollment.',
      );
  }

  async setElective(
    classSubjectId: string,
    isElective: boolean,
    actorUserId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const subject = await this.getClassSubject(manager, classSubjectId, true);
      if (subject.is_elective === isElective)
        return { is_elective: isElective };
      await this.assertNoRecordedScores(manager, subject);
      await manager.query(
        `UPDATE class_subjects SET is_elective = $2, updated_at = now() WHERE id = $1`,
        [classSubjectId, isElective],
      );
      if (!isElective) {
        await manager.query(
          `DELETE FROM student_subject_enrollments WHERE class_subject_id = $1`,
          [classSubjectId],
        );
      }
      await writeActivityLog(manager, {
        actorUserId,
        entityType: 'CLASS_SUBJECT',
        entityId: classSubjectId,
        action: 'UPDATE',
        description: isElective
          ? 'Subject marked elective'
          : 'Subject marked core',
        oldValues: { is_elective: subject.is_elective },
        newValues: { is_elective: isElective },
      });
      return { is_elective: isElective };
    });
  }

  async getEnrollment(classSubjectId: string, termId: string) {
    const subject = await this.getClassSubject(
      this.dataSource.manager,
      classSubjectId,
    );
    await this.assertTerm(this.dataSource.manager, termId, subject.session_id);
    const rows: Array<{ student_id: string }> = await this.dataSource.query(
      `SELECT e.student_id FROM student_subject_enrollments e
       JOIN class_students cs ON cs.student_id = e.student_id
         AND cs.class_id = $3 AND cs.session_id = $4 AND cs.is_active = true
       WHERE e.class_subject_id = $1 AND e.term_id = $2 ORDER BY e.student_id`,
      [classSubjectId, termId, subject.class_id, subject.session_id],
    );
    return {
      is_elective: subject.is_elective,
      student_ids: rows.map((r) => r.student_id),
    };
  }

  async replaceEnrollment(
    classSubjectId: string,
    termId: string,
    studentIds: string[],
    actorUserId: string,
  ) {
    if (new Set(studentIds).size !== studentIds.length)
      throw new BadRequestException('A student was selected more than once');
    return this.dataSource.transaction(async (manager) => {
      const subject = await this.getClassSubject(manager, classSubjectId, true);
      if (!subject.is_elective)
        throw new BadRequestException(
          'Student selection is only available for elective subjects',
        );
      await this.assertTerm(manager, termId, subject.session_id);
      await this.assertNoRecordedScores(manager, subject, termId);
      const eligible: Array<{ student_id: string }> = await manager.query(
        `SELECT DISTINCT cs.student_id FROM class_students cs
         JOIN students s ON s.id = cs.student_id JOIN users u ON u.id = s.user_id
         WHERE cs.class_id = $1 AND cs.session_id = $2 AND cs.is_active = true
           AND s.is_deleted IS NOT TRUE AND u.is_active = true
           AND cs.student_id = ANY($3::uuid[])`,
        [subject.class_id, subject.session_id, studentIds],
      );
      if (eligible.length !== studentIds.length)
        throw new BadRequestException(
          'Selection contains a student outside the active class roster',
        );
      await manager.query(
        `DELETE FROM student_subject_enrollments WHERE class_subject_id = $1 AND term_id = $2`,
        [classSubjectId, termId],
      );
      if (studentIds.length) {
        await manager.query(
          `INSERT INTO student_subject_enrollments (class_subject_id, student_id, term_id)
           SELECT $1, unnest($3::uuid[]), $2`,
          [classSubjectId, termId, studentIds],
        );
      }
      await writeActivityLog(manager, {
        actorUserId,
        entityType: 'CLASS_SUBJECT',
        entityId: classSubjectId,
        action: 'UPDATE',
        description: 'Elective student selection updated',
        metadata: { term_id: termId, student_count: studentIds.length },
      });
      return { is_elective: true, student_ids: studentIds };
    });
  }

  async isStudentEligible(
    classId: string,
    subjectId: string,
    termId: string,
    studentId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM class_subjects sub
       JOIN class c ON c.id = sub.class_id
       JOIN terms t ON t.id = $3 AND t.session_id = c.academic_session_id AND t.deleted_at IS NULL
       JOIN class_students cs ON cs.class_id = c.id AND cs.session_id = c.academic_session_id
         AND cs.student_id = $4 AND cs.is_active = true
       JOIN students s ON s.id = cs.student_id AND s.is_deleted IS NOT TRUE
       JOIN users u ON u.id = s.user_id AND u.is_active = true
       WHERE sub.class_id = $1 AND sub.subject_id = $2 AND c.is_deleted IS NOT TRUE
       AND (sub.is_elective = false OR EXISTS (
         SELECT 1 FROM student_subject_enrollments e
         WHERE e.class_subject_id = sub.id AND e.student_id = $4 AND e.term_id = $3
       )) LIMIT 1`,
      [classId, subjectId, termId, studentId],
    );
    return rows.length > 0;
  }

  async getEligibleStudentIds(
    classId: string,
    subjectId: string,
    termId: string,
  ): Promise<string[]> {
    const rows: Array<{ student_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT cs.student_id FROM class_subjects sub
       JOIN class c ON c.id = sub.class_id
       JOIN terms t ON t.id = $3 AND t.session_id = c.academic_session_id AND t.deleted_at IS NULL
       JOIN class_students cs ON cs.class_id = c.id AND cs.session_id = c.academic_session_id
         AND cs.is_active = true
       JOIN students s ON s.id = cs.student_id AND s.is_deleted IS NOT TRUE
       JOIN users u ON u.id = s.user_id AND u.is_active = true
       WHERE sub.class_id = $1 AND sub.subject_id = $2 AND c.is_deleted IS NOT TRUE
       AND (sub.is_elective = false OR EXISTS (
         SELECT 1 FROM student_subject_enrollments e
         WHERE e.class_subject_id = sub.id AND e.student_id = cs.student_id AND e.term_id = $3
       ))`,
      [classId, subjectId, termId],
    );
    return rows.map((row) => row.student_id);
  }

  async expectedSubjectCount(
    studentId: string,
    classId: string,
    termId: string,
  ) {
    const rows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT count(*)::text AS count FROM class_subjects sub
       WHERE sub.class_id = $1 AND (sub.is_elective = false OR EXISTS (
         SELECT 1 FROM student_subject_enrollments e
         WHERE e.class_subject_id = sub.id AND e.student_id = $2 AND e.term_id = $3
       ))`,
      [classId, studentId, termId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
