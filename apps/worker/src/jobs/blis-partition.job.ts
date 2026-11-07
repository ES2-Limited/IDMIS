import { sql, db } from '@idmis/db';

export interface BlisPartitionJobData {
  year?: number;
}

export async function processBlisPartitionJob(
  data?: BlisPartitionJobData,
): Promise<{ year: number; status: string }> {
  const targetYear = data?.year ?? new Date().getFullYear() + 1;
  await db.execute(sql`SELECT blis.ensure_measurement_partition(${targetYear});`);
  console.log(
    `[BlisPartitionJob] Successfully ensured BLIS measurement partition for year ${targetYear}`,
  );
  return { year: targetYear, status: 'success' };
}
