import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';


export class LoginUserDto {
    @IsNotEmpty({ message: 'Email is required.' })
    @IsEmail({}, { message: 'Email must be a valid email address.' })
    email: string;

    @IsNotEmpty({ message: 'Password is required.' })
    @IsString({ message: 'Password must be a string.' })
    password: string;

    @IsNotEmpty({ message: 'Role is required.' })
    role: UserRoleEnum;
}



