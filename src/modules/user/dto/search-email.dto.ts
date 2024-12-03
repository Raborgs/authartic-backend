import { IsEmail, IsNotEmpty, IsEnum } from 'class-validator';
import { UserRoleEnum } from '../enum/user.role.enum';

export class SearchEmailDto {
  @IsNotEmpty({ message: 'Email is required.' })
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  email: string;

  @IsNotEmpty({ message: 'Role is required.' })
  @IsEnum(UserRoleEnum, { message: 'Role is not valid.' })
  role: UserRoleEnum;
}
