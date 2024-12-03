
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-strategy.interface';
import { AuthService } from '../auth.service';
import { User } from 'src/modules/user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';


export class CustomUnauthorizedException extends UnauthorizedException {
    constructor(message: string) {
        super(message);
    }
}


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        private authService: AuthService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: 'Keyy',
        });
    }

    // async validate(payload: JwtPayload): Promise<User> {
    //     const user = await this.authService.findOneByEmail(payload.email);
    //     throwIfError(!user, 'User token is required.', CustomUnauthorizedException)
    //     return user;
    // }
    async validate(payload: JwtPayload): Promise<User> {
        if (!payload) {
            throw new CustomUnauthorizedException('Token not found. Please log in.');
        }
        
        const user = await this.authService.findOneByEmail(payload.email);
        throwIfError(!user, 'User not found or token is invalid. Please log in.', CustomUnauthorizedException);
        
        return user;
    }
}
