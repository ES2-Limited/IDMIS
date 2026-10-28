import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_AUTHENTICATED_KEY } from './authenticated.decorator';
import { CAN_PERMISSION_KEY } from './can.decorator';

@Injectable()
export class RouteMarkerValidator implements OnApplicationBootstrap {
  private readonly logger = new Logger(RouteMarkerValidator.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Validating route authorization markers across all controllers...');
    const controllers = this.discoveryService.getControllers();

    for (const controllerWrapper of controllers) {
      const { instance, metatype } = controllerWrapper;
      if (!instance || !metatype) continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (methodName) => methodName !== 'constructor' && typeof prototype[methodName] === 'function',
      );

      for (const methodName of methodNames) {
        const handler = prototype[methodName];

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler,
          metatype,
        ]);
        const isAuthenticated = this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, [
          handler,
          metatype,
        ]);
        const canPermission = this.reflector.getAllAndOverride<string>(CAN_PERMISSION_KEY, [
          handler,
          metatype,
        ]);

        let markerCount = 0;
        if (isPublic) markerCount++;
        if (isAuthenticated) markerCount++;
        if (canPermission) markerCount++;

        if (markerCount !== 1) {
          const controllerName = metatype.name;
          throw new Error(
            `[RouteMarkerError] Endpoint ${controllerName}.${methodName} must declare EXACTLY ONE of @Public(), @Authenticated(), or @Can(). Found ${markerCount} markers.`,
          );
        }
      }
    }

    this.logger.log('All routes successfully verified: exactly one authorization marker declared.');
  }
}
