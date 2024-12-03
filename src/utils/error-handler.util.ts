import { BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException, ConflictException } from '@nestjs/common';

export function throwIfError(value: any, message: string, ExceptionType = BadRequestException) {
  if (value) {
    throw new ExceptionType(message);
  }
}
