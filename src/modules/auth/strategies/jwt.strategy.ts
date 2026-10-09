import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';

import config from '../../../config/config';
import { Parent } from '../../parent/entities/parent.entity';
import { UserRole } from '../../shared/enums';
import { Student } from '../../student/entities/student.entity';
import { Teacher } from '../../teacher/entities/teacher.entity';
import { User } from '../../user/entities/user.entity';

interface IJwtPayload {
  sub: string;
  email: string;
  role: UserRole[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config().jwt.secret,
    });
  }

  async validate(payload: IJwtPayload) {
    const account = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!account || !account.is_active || account.deleted_at)
      throw new UnauthorizedException('Account is inactive or unavailable');
    const userData: {
      id: string;
      userId: string;
      email: string;
      roles: UserRole[];
      teacher_id?: string;
      student_id?: string;
      parent_id?: string;
    } = {
      id: payload.sub,
      userId: payload.sub,
      email: account.email,
      roles: account.role,
    };

    // If user has TEACHER role, fetch teacher_id
    if (account.role.includes(UserRole.TEACHER)) {
      const teacher = await this.teacherRepository.findOne({
        where: { user_id: payload.sub },
        select: ['id'],
      });
      if (teacher) {
        userData.teacher_id = teacher.id;
      }
    }

    // If user has STUDENT role, fetch student_id
    if (account.role.includes(UserRole.STUDENT)) {
      const student = await this.studentRepository.findOne({
        where: { user: { id: payload.sub } },
        select: ['id'],
      });
      if (student) {
        userData.student_id = student.id;
      }
    }

    // If user has PARENT role, fetch parent_id
    if (account.role.includes(UserRole.PARENT)) {
      const parent = await this.parentRepository.findOne({
        where: { user_id: payload.sub },
        select: ['id'],
      });
      if (parent) {
        userData.parent_id = parent.id;
      }
    }

    return userData;
  }
}
