import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import {
  db,
  indicator,
  organisation,
  organisationState,
  state,
  eq,
  and,
  isNull,
  inArray,
} from '@idmis/db';
import { ComputeRegistry, type ComputeContext } from '../compute/compute.registry';
import { ComputeResultRepository } from '../repositories/compute-result.repository';
import { IndicatorValueRepository } from '../repositories/indicator-value.repository';
import { IndicatorMatrixRepository } from '../repositories/indicator-matrix.repository';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { eventBus } from '../../../platform/events/event-bus';
import { validateApiEnv } from '../../../platform/config/env';

export function getQuarterPeriodEnd(year: number, quarter: number): string {
  switch (quarter) {
    case 1:
      return `${year}-03-31`;
    case 2:
      return `${year}-06-30`;
    case 3:
      return `${year}-09-30`;
    case 4:
      return `${year}-12-31`;
    default:
      throw new Error(`Invalid quarter: ${quarter}`);
  }
}

export interface RunComputeOptions {
  year?: number;
  quarter?: number;
  schemeId?: string;
}

interface ScopeTarget {
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId: string | null;
  scopeOrgId: string | null;
  irrigableAreaHa: string | null;
}

@Injectable()
export class MeComputeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeComputeService.name);
  private computeQueue: Queue;
  private computeWorker: Worker | null = null;
  private lastTriggered: { schemeId?: string; year?: number; quarter?: number } | null = null;
  private recomputeListener:
    ((ev: { schemeId?: string | null; year?: number; quarter?: number }) => void) | null = null;

  constructor(
    private readonly registry: ComputeRegistry,
    private readonly computeResultRepo: ComputeResultRepository,
    private readonly indicatorValueRepo: IndicatorValueRepository,
    private readonly indicatorMatrixRepo: IndicatorMatrixRepository,
  ) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queueName = process.env.ME_COMPUTE_QUEUE_NAME || 'me-compute';

    this.computeQueue = new Queue(queueName, {
      connection: {
        url: redisUrl,
        family: 0,
        lazyConnect: true,
      },
    });

    this.computeQueue.on('error', (err) => {
      this.logger.warn(`BullMQ compute queue error: ${err.message}`);
    });
  }

  getQueue(): Queue {
    return this.computeQueue;
  }

  getLastTriggered() {
    return this.lastTriggered;
  }

  async onModuleInit() {
    this.recomputeListener = (ev) => {
      void this.triggerRecompute(ev.schemeId ?? undefined, ev.year, ev.quarter);
    };
    eventBus.onRecompute(this.recomputeListener);

    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queueName = process.env.ME_COMPUTE_QUEUE_NAME || 'me-compute';

    try {
      this.computeWorker = new Worker(
        queueName,
        async (job) => {
          this.logger.log(`Processing compute job ${job.id}: ${JSON.stringify(job.data)}`);
          await this.runCompute({
            year: job.data?.year,
            quarter: job.data?.quarter,
            schemeId: job.data?.schemeId,
          });
        },
        {
          connection: {
            url: redisUrl,
            family: 0,
            lazyConnect: true,
          },
          concurrency: 1,
        },
      );

      this.computeWorker.on('error', (err) => {
        this.logger.warn(`BullMQ compute worker error: ${err.message}`);
      });

      // Register nightly repeatable job at 2:00 AM
      void this.computeQueue.upsertJobScheduler(
        'me:nightly-compute-scheduler',
        { pattern: '0 2 * * *' },
        {
          name: 'nightly-compute',
          data: {},
        },
      );
    } catch (err) {
      this.logger.warn(`BullMQ worker initialization skipped: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.recomputeListener) {
        eventBus.offRecompute(this.recomputeListener);
        this.recomputeListener = null;
      }
      if (this.computeWorker) {
        await this.computeWorker.close();
      }
      await this.computeQueue.close();
    } catch {
      // Ignore clean shutdown error
    }
  }

  /**
   * Enqueue a compute job for admin trigger. Returns immediately.
   */
  async enqueueCompute(options: { year: number; quarter?: number }) {
    try {
      await this.computeQueue.add('compute', options, {
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue compute job: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException('Compute queue is unavailable');
    }
  }

  private getDebounceWindowMs(): number {
    return validateApiEnv().ME_COMPUTE_DEBOUNCE_MS;
  }

  private async scheduleDebouncedJob(
    jobId: string,
    data: { schemeId?: string; year?: number; quarter?: number },
    delayMs: number,
  ) {
    try {
      await this.computeQueue.add('compute', data, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to schedule debounced compute job ${jobId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Debounced recompute trigger.
   * Collapses rapid event bursts into at most one scheme job and one global job per window.
   */
  async triggerRecompute(schemeId?: string, year?: number, quarter?: number) {
    this.lastTriggered = { schemeId, year, quarter };
    const delay = this.getDebounceWindowMs();

    if (schemeId) {
      await Promise.all([
        this.scheduleDebouncedJob(
          `debounce-scheme-${schemeId}`,
          { schemeId, year, quarter },
          delay,
        ),
        this.scheduleDebouncedJob('debounce-global', { year, quarter }, delay),
      ]);
    } else {
      await this.scheduleDebouncedJob('debounce-global', { year, quarter }, delay);
    }
  }

  /**
   * Main compute runner: computes all computed & survey indicators for the specified year/quarters.
   */
  async runCompute(options: RunComputeOptions = {}): Promise<{ computedCount: number }> {
    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    const year = options.year ?? currentYear;

    let quarters: number[];
    if (options.quarter !== undefined) {
      quarters = [options.quarter];
    } else if (year === currentYear) {
      const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
      quarters = Array.from({ length: currentQuarter }, (_, i) => i + 1);
    } else {
      quarters = [1, 2, 3, 4];
    }

    // 1. Fetch active indicators with method IN ('computed', 'survey')
    const activeIndicators = await db
      .select()
      .from(indicator)
      .where(and(isNull(indicator.deletedAt), inArray(indicator.method, ['computed', 'survey'])));

    // 2. Build Scopes
    // Scheme scopes
    const schemes = await db
      .select({
        id: organisation.id,
        name: organisation.name,
        irrigableAreaHa: organisation.irrigableAreaHa,
        stateId: organisationState.stateId,
      })
      .from(organisation)
      .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
      .where(and(eq(organisation.type, 'scheme'), isNull(organisation.deletedAt)));

    // State scopes
    const states = await db
      .select({
        id: state.id,
        code: state.code,
      })
      .from(state)
      .where(isNull(state.deletedAt));

    // Calculate sum of irrigable area by state and total national
    let nationalIrrigableArea = 0;
    const stateIrrigableAreaMap = new Map<string, number>();

    for (const s of schemes) {
      const area = Number(s.irrigableAreaHa || 0);
      if (area > 0) {
        nationalIrrigableArea += area;
        if (s.stateId) {
          stateIrrigableAreaMap.set(s.stateId, (stateIrrigableAreaMap.get(s.stateId) || 0) + area);
        }
      }
    }

    const scopeTargets: ScopeTarget[] = [];

    if (options.schemeId) {
      const sc = schemes.find((s) => s.id === options.schemeId);
      if (sc) {
        scopeTargets.push({
          scopeType: 'scheme',
          scopeStateId: sc.stateId ?? null,
          scopeOrgId: sc.id,
          irrigableAreaHa: sc.irrigableAreaHa ?? null,
        });
      }
    } else {
      // National
      scopeTargets.push({
        scopeType: 'national',
        scopeStateId: null,
        scopeOrgId: null,
        irrigableAreaHa: nationalIrrigableArea > 0 ? nationalIrrigableArea.toFixed(4) : null,
      });

      // States
      for (const st of states) {
        const stateArea = stateIrrigableAreaMap.get(st.id) || 0;
        scopeTargets.push({
          scopeType: 'state',
          scopeStateId: st.id,
          scopeOrgId: null,
          irrigableAreaHa: stateArea > 0 ? stateArea.toFixed(4) : null,
        });
      }

      // Schemes
      for (const sc of schemes) {
        scopeTargets.push({
          scopeType: 'scheme',
          scopeStateId: sc.stateId ?? null,
          scopeOrgId: sc.id,
          irrigableAreaHa: sc.irrigableAreaHa ?? null,
        });
      }
    }

    let computedCount = 0;

    // 3. Compute loop
    for (const q of quarters) {
      const periodEnd = getQuarterPeriodEnd(year, q);

      for (const ind of activeIndicators) {
        if (!ind.computeKey) {
          continue;
        }

        for (const target of scopeTargets) {
          const ctx: ComputeContext = {
            year,
            quarter: q,
            periodEnd,
            scope: target,
          };

          const outputs = await this.registry.execute(ind.computeKey, ctx);

          await runInTransaction(async (tx) => {
            for (const out of outputs) {
              // 1. Write compute_result
              await this.computeResultRepo.upsert(
                {
                  indicatorId: ind.id,
                  periodYear: year,
                  periodQuarter: q,
                  scopeType: target.scopeType,
                  scopeStateId: target.scopeStateId,
                  scopeOrgId: target.scopeOrgId,
                  disaggregation: out.disaggregation,
                  status: out.status,
                  message: out.message ?? null,
                  computedAt: now,
                },
                tx,
              );

              // 2. Handle indicator_value
              if (out.status === 'computed' && out.value !== null) {
                await this.indicatorValueRepo.upsertComputedSlot(
                  {
                    indicatorId: ind.id,
                    periodYear: year,
                    periodQuarter: q,
                    scopeType: target.scopeType,
                    scopeStateId: target.scopeStateId,
                    scopeOrgId: target.scopeOrgId,
                    disaggregation: out.disaggregation,
                    value: out.value,
                    source: 'computed',
                    status: 'approved',
                    computedAt: now,
                  },
                  tx,
                );
                computedCount++;
              } else if (out.status === 'not_available' || out.status === 'error') {
                // When a slot becomes not_available/error, DELETE any stale computed indicator_value for that slot
                await this.indicatorValueRepo.deleteComputedSlot(
                  ind.id,
                  year,
                  q,
                  target.scopeType,
                  target.scopeStateId,
                  target.scopeOrgId,
                  out.disaggregation,
                  tx,
                );
              }
            }
          });
        }
      }
    }

    // 4. Refresh materialized view after compute run
    try {
      await this.indicatorMatrixRepo.refreshMatrix();
    } catch (err) {
      this.logger.error(`Failed to refresh mv_indicator_matrix: ${(err as Error).message}`);
    }

    return { computedCount };
  }
}
