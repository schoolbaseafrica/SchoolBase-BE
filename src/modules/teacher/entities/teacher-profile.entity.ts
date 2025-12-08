import { Entity, Column } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';

@Entity('teacher_profiles')
export class TeacherProfile extends BaseEntity {
  @Column({ unique: true })
  teacher_uid: string;

  @Column()
  user_id: number;

  @Column()
  first_name: string;

  @Column()
  last_name: string;
}
