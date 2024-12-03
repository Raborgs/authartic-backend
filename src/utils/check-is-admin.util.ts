// src/common/role-check.util.ts
import { ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { throwIfError } from './error-handler.util';

export function checkIsAdmin(user: User, message: string = 'Only Admin can perform this action.') {
  throwIfError((user.role !== UserRoleEnum.ADMIN), `${message}`, ForbiddenException)
}
