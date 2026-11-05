import { Controller, Get, Post, Param, Body, Res, HttpStatus, HttpCode } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { permissions } from '@idmis/contracts';
import { Can } from '../../../platform/auth/can.decorator';
import { Authenticated } from '../../../platform/auth/authenticated.decorator';
import { CurrentAuthz } from '../../../platform/auth/current-authz.decorator';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import {
  MapService,
  type UploadGeoJsonInput,
  type UploadShapefileInput,
} from '../services/map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  /**
   * Vector Tile endpoint: GET /map/tiles/:layer/:z/:x/:y.mvt
   */
  @Get('tiles/:layer/:z/:x/:y')
  @Authenticated()
  async getTile(
    @Param('layer') layer: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentAuthz() authz: UserAuthz,
    @Res() res: FastifyReply,
  ) {
    const cleanY = y.replace(/\.mvt$/i, '');
    const tileBuffer = await this.mapService.getVectorTile(layer, z, x, cleanY, authz);

    if (!tileBuffer || tileBuffer.length === 0) {
      return res.status(HttpStatus.NO_CONTENT).send();
    }

    return res
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/vnd.mapbox-vector-tile')
      .header('Cache-Control', 'public, max-age=3600')
      .send(tileBuffer);
  }

  /**
   * Upload GeoJSON layer.
   */
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

  /**
   * Upload zipped Shapefile layer (.shp, .shx, .dbf, .prj).
   */
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

@Controller('blis/map')
export class BlisMapController {
  constructor(private readonly mapService: MapService) {}

  /**
   * Vector Tile endpoint: GET /blis/map/tiles/:layer/:z/:x/:y.mvt
   */
  @Get('tiles/:layer/:z/:x/:y')
  @Authenticated()
  async getTile(
    @Param('layer') layer: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentAuthz() authz: UserAuthz,
    @Res() res: FastifyReply,
  ) {
    const cleanY = y.replace(/\.mvt$/i, '');
    const tileBuffer = await this.mapService.getVectorTile(layer, z, x, cleanY, authz);

    if (!tileBuffer || tileBuffer.length === 0) {
      return res.status(HttpStatus.NO_CONTENT).send();
    }

    return res
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/vnd.mapbox-vector-tile')
      .header('Cache-Control', 'public, max-age=3600')
      .send(tileBuffer);
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
