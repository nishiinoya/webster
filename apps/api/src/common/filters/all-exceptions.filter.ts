import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProjectErrorPayload } from '@webster/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ProjectErrorPayload['code'] = 'socket_error';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) ?? message;
      }

      if (status === HttpStatus.UNAUTHORIZED) code = 'forbidden';
      else if (status === HttpStatus.FORBIDDEN) code = 'forbidden';
      else if (status === HttpStatus.NOT_FOUND) code = 'not_found';
      else code = 'socket_error';
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const projectId: string | undefined =
      (request.params as Record<string, string>)?.['projectId'] ??
      (request.params as Record<string, string>)?.['id'];

    const payload: ProjectErrorPayload & { statusCode: number; path: string; timestamp: string } = {
      statusCode: status,
      code,
      message: Array.isArray(message) ? message.join(', ') : message,
      projectId,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(payload);
  }
}
