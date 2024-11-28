import { APIGatewayEvent, Context } from 'aws-lambda';

abstract class CustomError extends Error {
  abstract statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// 경로가 정의되지 않은 경우
export class UndefinedPathError extends CustomError {
  statusCode = 404;
  constructor() {
    super('정의되지 않은 경로입니다.');
  }
}

// 인증 애러
export class UnauthorizedError extends CustomError {
  statusCode = 401;
  constructor(message?: string) {
    super(message ?? '인증되지 않은 사용자입니다.');
  }
}

// 권한이 없는 경우
export class ForbiddenError extends CustomError {
  statusCode = 403;
  constructor(message?: string) {
    super(message ?? '권한이 없습니다.');
  }
}

// 잘못된 요청
export class BadRequestError extends CustomError {
  statusCode = 400;
  constructor(message?: string) {
    super(message ?? '잘못된 요청입니다.');
  }
}

// 서버 에러
export class InternalServerError extends CustomError {
  statusCode = 500;
  constructor(message?: string) {
    super(message ?? '서버 에러입니다.');
  }
}

// 데이터베이스 에러
export class DatabaseError extends CustomError {
  statusCode = 500;
  constructor(message?: string) {
    super(message ?? '데이터베이스 에러입니다.');
  }
}

// 데이터가 없는 경우
export class NotFoundError extends CustomError {
  statusCode = 404;
  constructor(message?: string) {
    super(message ?? '데이터가 없습니다.');
  }
}

// 중복된 데이터가 있는 경우
export class ConflictError extends CustomError {
  statusCode = 409;
  constructor(message?: string) {
    super(message ?? '중복된 데이터가 있습니다.');
  }
}

// 유효성 검사 에러
export class ValidationError extends CustomError {
  statusCode = 400;
  constructor(message?: string) {
    super(message ?? '유효성 검사 에러입니다.');
  }
}

export default function errorHandler(
  error: Error,
  event: APIGatewayEvent,
  context: Context,
) {
  const {
    httpMethod: method,
    path,
    queryStringParameters: query,
    body,
    headers,
  } = event;

  console.error({
    level: 'error',
    message: 'ErrorLog',
    method,
    path,
    query,
    body,
    headers,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });

  const statusCode = error instanceof CustomError ? error.statusCode : 500;
  const message = error.message || 'Internal Server Error';

  return {
    statusCode,
    body: JSON.stringify({ message, error: error.name }),
  };
}
