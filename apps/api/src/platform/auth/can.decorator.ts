import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@idmis/contracts';

export const CAN_PERMISSION_KEY = 'canPermission';
export const Can = (permission: Permission) => SetMetadata(CAN_PERMISSION_KEY, permission);
