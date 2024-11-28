import { APIGatewayEvent, Context } from 'aws-lambda';
import 'reflect-metadata';
import errorHandler, {
  ForbiddenError,
  UndefinedPathError,
} from './error_handler';

type Guard = (event: APIGatewayEvent, context: Context) => Promise<boolean>;

type Middleware = (event: APIGatewayEvent, context: Context) => Promise<void>;

interface StaticRoute {
  method: string;
  path: string;
  handler: Handler;
  guards: Guard[];
}

interface DynamicRoute {
  method: string;
  path: RegExp;
  handler: Handler;
  guards: Guard[];
}

interface Response {
  statusCode: number;
  body: {
    message: string;
    data?: any;
  };
}

type Handler = (...args: any[]) => Promise<Response>;

type ControllerType = new () => {
  [key: string]: Handler;
};

export function createRouter() {
  return new Router();
}

class Router {
  private staticRoutes: StaticRoute[] = [];
  private dynamicRoutes: DynamicRoute[] = [];
  private middlewares: Middleware[] = [];

  private logger?: Middleware;

  // 로깅 미들웨어 추가
  useLogger(logger: Middleware) {
    this.logger = logger;
  }

  // 미들웨어 추가
  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  // 라우트 추가
  addRoute(controller: ControllerType) {
    const instance = new controller();
    const controllerPath = Reflect.getMetadata('path', controller);

    const methods = Object.getOwnPropertyNames(controller.prototype);
    methods.forEach((methodName) => {
      if (methodName === 'constructor') return;

      const method: string = Reflect.getMetadata(
        'method',
        controller,
        methodName,
      );
      const path: string = Reflect.getMetadata('path', controller, methodName);
      const guards: Guard[] =
        Reflect.getMetadata('guards', controller, methodName) || [];

      // 경로가 동적인지 정적인지 구분하여 처리
      if (path.includes(':')) {
        // 동적 경로
        const dynamicPathPattern = this.convertToRegExp(controllerPath + path);
        this.dynamicRoutes.push({
          method,
          path: dynamicPathPattern,
          handler: instance[methodName].bind(instance),
          guards,
        });
      } else {
        // 정적 경로
        this.staticRoutes.push({
          method,
          path: controllerPath + path,
          handler: instance[methodName].bind(instance),
          guards,
        });
      }
    });
  }

  // 요청을 처리하는 함수
  async handleRequest(event: APIGatewayEvent, context: Context) {
    const { httpMethod, path } = event;

    try {
      // 로깅 미들웨어 실행
      if (this.logger) {
        await this.logger(event, context);
      }

      // 미들웨어 실행
      for (const middleware of this.middlewares) {
        await middleware(event, context);
      }

      // 먼저 정적 경로를 검사
      const staticRoute = this.staticRoutes.find(
        (route) => route.method === httpMethod && route.path === path,
      );
      if (staticRoute) {
        await this.processGuards(staticRoute.guards, event, context);
        return this.invokeHandler(staticRoute.handler, event, context);
      }

      // 정적 경로에서 매칭되지 않으면 동적 경로를 검사
      const dynamicRoute = this.dynamicRoutes.find((route) => {
        const match = path.match(route.path);
        if (match && match[0] === path) {
          // 동적 경로에서 파라미터 추출
          const params = this.extractParams(route.path, match);
          event.pathParameters = params;
          return true;
        }
        return false;
      });

      if (dynamicRoute) {
        await this.processGuards(dynamicRoute.guards, event, context);
        return this.invokeHandler(dynamicRoute.handler, event, context);
      }

      throw new UndefinedPathError();
    } catch (error) {
      return errorHandler(error as Error, event, context);
    }
  }

  private async processGuards(
    guards: Guard[],
    event: APIGatewayEvent,
    context: Context,
  ) {
    for (const guard of guards) {
      const result = await guard(event, context);
      if (!result) {
        throw new ForbiddenError();
      }
    }
    return true;
  }

  private async invokeHandler(
    handler: Handler,
    event: APIGatewayEvent,
    context: Context,
  ) {
    // 핸들러의 메타데이터 읽기
    const target = handler.prototype || handler; // 클래스를 위한 메타데이터 가져오기
    const methodName = handler.name;
    const paramsMetadata: Array<{
      index: number;
      type: string;
      param?: string;
    }> = Reflect.getMetadata('parameters', target, methodName) || [];

    // 매개변수 처리
    const args: any[] = [];
    for (const { index, type, param } of paramsMetadata) {
      switch (type) {
        case 'body':
          if (!event.body) {
            args[index] = undefined;
            break;
          }
          args[index] = param
            ? JSON.parse(event.body)[param]
            : JSON.parse(event.body);
          break;
        case 'query':
          args[index] = param
            ? event.queryStringParameters?.[param]
            : event.queryStringParameters;
          break;
        case 'params':
          args[index] = param
            ? event.pathParameters?.[param]
            : event.pathParameters;
          break;
        case 'headers':
          args[index] = param
            ? event.headers?.[param.toLowerCase()]
            : event.headers;
          break;
        default:
          args[index] = undefined;
      }
    }

    // 핸들러 호출
    const res = await handler(...args);

    // 응답 형식 표준화
    return {
      statusCode: res.statusCode,
      body: JSON.stringify(res.body),
    };
  }

  // 동적 경로를 정규 표현식으로 변환
  private convertToRegExp(path: string) {
    const pattern = path.replace(/:([a-zA-Z0-9]+)/g, '([^/]+)');
    return new RegExp(`^${pattern}$`);
  }

  // 동적 경로에서 파라미터 추출
  private extractParams(pattern: RegExp, match: RegExpMatchArray) {
    const params: Record<string, string> = {};
    const keys = pattern.toString().match(/:([a-zA-Z0-9]+)/g) || [];
    keys.forEach((key, index) => {
      params[key.slice(1)] = match[index + 1];
    });
    return params;
  }
}

// 데코레이터 구현
export function Controller(path: string) {
  return function (target: Function) {
    Reflect.defineMetadata('path', path, target);
  };
}

export function Get(path: string): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata('method', 'GET', target, propertyKey);
    Reflect.defineMetadata('path', path, target, propertyKey);
  };
}

export function Post(path: string): MethodDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata('method', 'POST', target, propertyKey);
    Reflect.defineMetadata('path', path, target, propertyKey);
  };
}

export function Put(path: string): MethodDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata('method', 'PUT', target, propertyKey);
    Reflect.defineMetadata('path', path, target, propertyKey);
  };
}

export function Delete(path: string): MethodDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata('method', 'DELETE', target, propertyKey);
    Reflect.defineMetadata('path', path, target, propertyKey);
  };
}

export function Body(param?: string) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParamMetadata =
      Reflect.getOwnMetadata('parameters', target, propertyKey) || [];
    existingParamMetadata.push({ index: parameterIndex, type: 'body', param });
    Reflect.defineMetadata(
      'parameters',
      existingParamMetadata,
      target,
      propertyKey,
    );
  };
}

export function Query(param?: string) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParamMetadata =
      Reflect.getOwnMetadata('parameters', target, propertyKey) || [];
    existingParamMetadata.push({ index: parameterIndex, type: 'query', param });
    Reflect.defineMetadata(
      'parameters',
      existingParamMetadata,
      target,
      propertyKey,
    );
  };
}

export function Params(param?: string) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParamMetadata =
      Reflect.getOwnMetadata('parameters', target, propertyKey) || [];
    existingParamMetadata.push({
      index: parameterIndex,
      type: 'params',
      param,
    });
    Reflect.defineMetadata(
      'parameters',
      existingParamMetadata,
      target,
      propertyKey,
    );
  };
}

export function Headers(param?: string) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParamMetadata =
      Reflect.getOwnMetadata('parameters', target, propertyKey) || [];
    existingParamMetadata.push({
      index: parameterIndex,
      type: 'headers',
      param,
    });
    Reflect.defineMetadata(
      'parameters',
      existingParamMetadata,
      target,
      propertyKey,
    );
  };
}

export function UseGuard(guard: Guard) {
  return function (target: any, propertyKey: string) {
    const existingGuards =
      Reflect.getOwnMetadata('guards', target, propertyKey) || [];
    existingGuards.push(guard);
    Reflect.defineMetadata('guards', existingGuards, target, propertyKey);
  };
}

export async function DefaultCloudWatchLogger(
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

  console.log({
    level: 'info',
    message: 'Request',
    method,
    path,
    query,
    body,
    headers,
  });
}
