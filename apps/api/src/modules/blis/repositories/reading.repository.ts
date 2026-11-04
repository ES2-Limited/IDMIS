import { Injectable, BadRequestException } from '@nestjs/common';
import { db, measurement, parameter, eq, and, sql } from '@idmis/db';
import type {
  GetStationReadingsQuery,
  RawReadingsResponse,
  AggregatedReadingsResponse,
} from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

@Injectable()
export class ReadingRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async resolveParameter(paramCodeOrId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      paramCodeOrId,
    );

    const condition = isUuid
      ? sql`${parameter.id} = ${paramCodeOrId}::uuid OR ${parameter.code} = ${paramCodeOrId}`
      : eq(parameter.code, paramCodeOrId.toUpperCase());

    const [row] = await client
      .select({
        id: parameter.id,
        code: parameter.code,
        name: parameter.name,
        defaultUnit: parameter.defaultUnit,
      })
      .from(parameter)
      .where(condition)
      .limit(1);

    if (!row) {
      throw new BadRequestException(`Parameter '${paramCodeOrId}' not found`);
    }
    return row;
  }

  async getRawReadings(
    stationId: string,
    parameterId: string,
    parameterCode: string,
    query: GetStationReadingsQuery,
    txDb?: DatabaseOrTx,
  ): Promise<RawReadingsResponse> {
    const client = this.getDb(txDb);
    const limit = query.limit ?? 100;

    const conditions = [
      eq(measurement.stationId, stationId),
      eq(measurement.parameterId, parameterId),
    ];

    if (query.from) {
      conditions.push(sql`${measurement.observedAt} >= ${query.from}::timestamptz`);
    }
    if (query.to) {
      conditions.push(sql`${measurement.observedAt} <= ${query.to}::timestamptz`);
    }
    if (query.quality) {
      conditions.push(eq(measurement.quality, query.quality));
    }
    if (query.cursor) {
      conditions.push(sql`${measurement.observedAt} > ${query.cursor}::timestamptz`);
    }

    const rows = await client
      .select({
        id: measurement.id,
        stationId: measurement.stationId,
        parameterId: measurement.parameterId,
        observedAt: measurement.observedAt,
        value: measurement.value,
        unit: measurement.unit,
        quality: measurement.quality,
        source: measurement.source,
      })
      .from(measurement)
      .where(and(...conditions))
      .orderBy(measurement.observedAt)
      .limit(limit + 1);

    let nextCursor: string | null = null;
    let items = rows;
    if (rows.length > limit) {
      items = rows.slice(0, limit);
      nextCursor = items[items.length - 1]!.observedAt;
    }

    return {
      items: items.map((r) => ({
        id: r.id,
        stationId: r.stationId,
        parameterId: r.parameterId,
        parameterCode,
        observedAt: r.observedAt,
        value: r.value,
        unit: r.unit,
        quality: r.quality,
        source: r.source,
      })),
      nextCursor,
    };
  }

  async getAggregatedReadings(
    stationId: string,
    parameterId: string,
    parameterCode: string,
    defaultUnit: string,
    query: GetStationReadingsQuery,
    interval: 'day' | 'month' | 'year',
    txDb?: DatabaseOrTx,
  ): Promise<AggregatedReadingsResponse> {
    const client = this.getDb(txDb);

    const fromClause = query.from ? sql`AND m.observed_at >= ${query.from}::timestamptz` : sql``;
    const toClause = query.to ? sql`AND m.observed_at <= ${query.to}::timestamptz` : sql``;
    const qualityClause = query.quality ? sql`AND m.quality = ${query.quality}` : sql``;

    const intervalSql =
      interval === 'day' ? sql`'day'` : interval === 'month' ? sql`'month'` : sql`'year'`;

    const result = await client.execute<{
      bucket: string;
      min: string;
      max: string;
      avg: string;
      count: number;
    }>(sql`
      SELECT
        to_char(date_trunc(${intervalSql}, m.observed_at AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
        ROUND(MIN(m.value), 4)::text AS min,
        ROUND(MAX(m.value), 4)::text AS max,
        ROUND(AVG(m.value), 4)::text AS avg,
        COUNT(*)::int AS count
      FROM blis.measurement m
      WHERE m.station_id = ${stationId}::uuid
        AND m.parameter_id = ${parameterId}::uuid
        ${fromClause}
        ${toClause}
        ${qualityClause}
      GROUP BY 1
      ORDER BY 1 ASC;
    `);

    return {
      interval,
      parameterCode,
      unit: defaultUnit,
      items: (result ?? []).map((r) => ({
        bucket: r.bucket,
        min: r.min,
        max: r.max,
        avg: r.avg,
        count: Number(r.count),
      })),
    };
  }
}
