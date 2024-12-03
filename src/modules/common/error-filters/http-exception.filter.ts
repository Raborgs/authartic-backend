import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp(); 87
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        const exceptionResponse = exception.getResponse();
        const exceptionMessage = (exceptionResponse as any).message;
        const message = Array.isArray(exceptionMessage)
            ? (exceptionMessage.length > 2 
                ? exceptionMessage[1] 
                : exceptionMessage[exceptionMessage.length - 1] 
              )
            : exceptionMessage || 'Internal Server Error';
        
        response.status(status).json({
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: message,
            error: exception.name,
        });
        
    }
}
