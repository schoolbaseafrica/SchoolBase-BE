import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';

import { SkipWrap } from '../../common/decorators/skip-wrap.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../shared/enums';

import { ApiUpdateUser } from './docs/user.swagger';
import { AssignFirstOwnerDto } from './dto/assign-first-owner.dto';
import { ListAdminsQueryDto } from './dto/list-admins-query.dto';
import { SetAdminActiveDto } from './dto/set-admin-active.dto';
import { TransferOwnerDto } from './dto/transfer-owner.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiUpdateUser()
  async updateMe(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateUser(updateUserDto, { id: user.id });
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @SkipWrap()
  findAdmins(@Query() query: ListAdminsQueryDto) {
    return this.userService.findAdmins(query);
  }

  @Get('owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getFirstOwner() {
    return this.userService.getFirstOwner();
  }

  @Post('owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assignFirstOwner(
    @Body() dto: AssignFirstOwnerDto,
    @CurrentUser() actor: User,
  ) {
    return this.userService.assignFirstOwner(dto.owner_user_id, actor.id);
  }

  @Post('owner/transfer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  transferOwner(@Body() dto: TransferOwnerDto, @CurrentUser() actor: User) {
    return this.userService.transferOwner(dto.new_owner_user_id, actor.id);
  }

  @Patch('admins/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setAdminActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAdminActiveDto,
    @CurrentUser() actor: User,
  ) {
    return this.userService.setAdminActive(id, actor.id, dto.is_active);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findAdminProfile(id);
  }
}
