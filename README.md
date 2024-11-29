# Lamfox

Lamfox는 AWS Lambda 환경에서 작고 가벼운 라우팅 프로그램으로, NestJS와 유사한 데코레이터 기반 구조를 사용하여 컨트롤러와 서비스를 구성할 수 있도록 설계되었습니다.

## 주요 특징

- **데코레이터 기반**: `@Controller`, `@Get`, `@Post` 등의 데코레이터를 활용해 간결한 코드로 라우팅을 정의합니다.
- **정적 및 동적 라우팅**: 정적 경로와 URL 파라미터를 처리할 수 있는 동적 경로를 모두 지원합니다.
- **미들웨어 및 가드**: 요청 처리 전에 미들웨어와 가드를 실행하여 인증 및 검증을 수행할 수 있습니다.
- **AWS Lambda 최적화**: Lambda의 경량성과 효율성을 극대화합니다.

## 설치

```bash
npm install lamfox
```

## 사용 방법

### 1. 기본 설정

```typescript
import { createRouter, Controller, Get, Post, Body } from 'lamfox';
import { APIGatewayEvent, Context } from 'aws-lambda';

// 컨트롤러 정의
@Controller('/users')
class UserController {
  @Get('/')
  async getUsers() {
    return {
      statusCode: 200,
      body: {
        message: 'Get all users',
      },
    };
  }

  @Post('/')
  async createUser(@Body('name') name: string) {
    return {
      statusCode: 201,
      body: {
        message: `User ${name} created!`,
      },
    };
  }
}

// 라우터 생성 및 설정
const router = createRouter();
router.addRoute(UserController);

export const handler = async (event: APIGatewayEvent, context: Context) => {
  return router.handleRequest(event, context);
};
```

### 2. 미들웨어 추가

```typescript
router.use(async (event, context) => {
  console.log('Request received:', event.path);
});
```

### 3. 가드 사용

```typescript
import { UseGuard } from 'lamfox';

const isAuthenticated: Guard = async (event, context) => {
  const token = event.headers?.authorization;
  return token === 'valid-token';
};

@Controller('/secure')
class SecureController {
  @Get('/')
  @UseGuard(isAuthenticated)
  async secureEndpoint() {
    return {
      statusCode: 200,
      body: {
        message: 'Access granted!',
      },
    };
  }
}

router.addRoute(SecureController);
```

### 4. 동적 라우팅

```typescript
@Controller('/items')
class ItemController {
  @Get('/:id')
  async getItem(@Params('id') id: string) {
    return {
      statusCode: 200,
      body: {
        message: `Item ID: ${id}`,
      },
    };
  }
}

router.addRoute(ItemController);
```

## 데코레이터 목록

- `@Controller(path: string)`: 컨트롤러의 기본 경로를 설정합니다.
- `@Get(path: string)`: GET 요청을 처리합니다.
- `@Post(path: string)`: POST 요청을 처리합니다.
- `@Put(path: string)`: PUT 요청을 처리합니다.
- `@Delete(path: string)`: DELETE 요청을 처리합니다.
- `@Body(param?: string)`: 요청 본문(body) 데이터를 매개변수로 바인딩합니다.
- `@Query(param?: string)`: 쿼리 문자열 데이터를 매개변수로 바인딩합니다.
- `@Params(param?: string)`: 경로 파라미터 데이터를 매개변수로 바인딩합니다.
- `@Headers(param?: string)`: 헤더 데이터를 매개변수로 바인딩합니다.
- `@UseGuard(guard: Guard)`: 가드를 설정합니다.

## 에러 처리

Lamfox는 미리 정의된 에러 클래스를 통해 예외 상황을 처리합니다:

- `ForbiddenError`: 가드가 실패한 경우 발생합니다.
- `UndefinedPathError`: 정의되지 않은 경로에 요청이 들어온 경우 발생합니다.

```typescript
import errorHandler from './error_handler';

router.handleRequest(event, context).catch((error) => {
  return errorHandler(error, event, context);
});
```

## 로깅

기본 CloudWatch 로깅 미들웨어를 제공합니다:

```typescript
import { DefaultCloudWatchLogger } from 'lamfox';

router.useLogger(DefaultCloudWatchLogger);
```

## 기여

버그 보고 또는 기능 요청은 [GitHub 이슈 트래커](https://github.com/your-repo/lamfox/issues)를 통해 남겨주세요.

## 라이선스

[MIT](LICENSE)
