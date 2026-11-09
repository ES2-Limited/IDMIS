import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { permissions, ListMapLayersQuerySchema, type ListMapLayersQuery } from '@idmis/contracts';
import { Can } from '../../../platform/auth/can.decorator';
import { CurrentAuthz } from '../../../platform/auth/current-authz.decorator';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import {
  MapService,
  type UploadGeoJsonInput,
  type UploadShapefileInput,
} from '../services/map.service';

/**
 * Shared helper to serve Mapbox Vector Tiles (.mvt) with private caching headers.
 */
async function serveVectorTile(
  mapService: MapService,
  layer: string,
  z: string,
  x: string,
  y: string,
  authz: UserAuthz,
  res: FastifyReply,
) {
  const cleanY = y.replace(/\.mvt$/i, '');
  const tileBuffer = await mapService.getVectorTile(layer, z, x, cleanY, authz);

  if (!tileBuffer || tileBuffer.length === 0) {
    return res.status(HttpStatus.NO_CONTENT).send();
  }

  return res
    .status(HttpStatus.OK)
    .header('Content-Type', 'application/vnd.mapbox-vector-tile')
    .header('Cache-Control', 'private, max-age=300')
    .header('Vary', 'Authorization, Cookie')
    .send(tileBuffer);
}

/**
 * Global Vector Tile controller: GET /map/tiles/:layer/:z/:x/:y.mvt (alias)
 */
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('tiles/:layer/:z/:x/:y')
  @Can(permissions.BLIS_MAP_READ)
  async getTile(
    @Param('layer') layer: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentAuthz() authz: UserAuthz,
    @Res() res: FastifyReply,
  ) {
    return serveVectorTile(this.mapService, layer, z, x, y, authz, res);
  }
}

/**
 * BLIS Map controller: GET /blis/map/tiles/:layer/:z/:x/:y.mvt and layer uploads
 */
@Controller('blis/map')
export class BlisMapController {
  constructor(private readonly mapService: MapService) {}

  @Get('tiles/:layer/:z/:x/:y')
  @Can(permissions.BLIS_MAP_READ)
  async getTile(
    @Param('layer') layer: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentAuthz() authz: UserAuthz,
    @Res() res: FastifyReply,
  ) {
    return serveVectorTile(this.mapService, layer, z, x, y, authz, res);
  }

  @Get('layers')
  @Can(permissions.BLIS_MAP_READ)
  async listLayers(
    @Query(new ZodValidationPipe(ListMapLayersQuerySchema)) query: ListMapLayersQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.mapService.listLayers(query, authz);
  }

  @Get('layers/:id')
  @Can(permissions.BLIS_MAP_READ)
  async getLayer(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.mapService.getLayer(id, authz);
  }

  @Post('layers/geojson')
  @Can(permissions.BLIS_MAP_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async uploadGeoJson(
    @Body() input: UploadGeoJsonInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mapService.uploadGeoJson(input, authz, user.id);
  }

  @Post('layers/shapefile')
  @Can(permissions.BLIS_MAP_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async uploadShapefile(
    @Body() input: UploadShapefileInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mapService.uploadShapefile(input, authz, user.id);
  }
}
