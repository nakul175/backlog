import { Cron } from 'croner';
import { HttpError } from '#shared/lib';

function parseCron(expression: string): Cron {
  try {
    return new Cron(expression, { timezone: 'UTC', paused: true });
  } catch {
    throw new HttpError(400, 'Invalid cron expression');
  }
}

export function nextCronRun(expression: string, from = new Date()): Date {
  const next = parseCron(expression).nextRun(from);
  if (!next) throw new HttpError(400, 'Invalid cron expression');
  return next;
}

// The shortest gap between the runs ahead. A cron fires irregularly ('0 0 * * 1,2'),
// so measuring only the gap after the first run would let a burst through.
export function minCronIntervalSeconds(expression: string, from = new Date()): number {
  const runs = parseCron(expression).nextRuns(5, from);
  if (runs.length < 2) throw new HttpError(400, 'Invalid cron expression');
  let shortest = Infinity;
  for (let i = 1; i < runs.length; i++) {
    shortest = Math.min(shortest, (runs[i].getTime() - runs[i - 1].getTime()) / 1000);
  }
  return shortest;
}
