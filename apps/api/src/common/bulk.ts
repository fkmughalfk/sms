import { HttpException } from '@nestjs/common';
import type { BulkResult } from '@sms/shared';

/** The message of a Nest HTTP error (string, `{ message }`, or zod's `{ message, errors }`). */
function messageOf(e: HttpException): string {
  const res = e.getResponse();
  if (typeof res === 'string') return res;
  const msg = (res as { message?: unknown }).message;
  if (Array.isArray(msg)) return msg.join(' ');
  return typeof msg === 'string' ? msg : e.message;
}

/**
 * Applies `fn` to each id in turn. Every record keeps its own transaction and audit entry,
 * so one record in use (409), not allowed (403/400) or already gone (404) is skipped with
 * its reason instead of failing the whole batch. Server errors still abort.
 */
export async function runBulk(
  ids: readonly string[],
  fn: (id: string) => Promise<unknown>,
): Promise<BulkResult> {
  const result: BulkResult = { done: 0, skipped: [] };
  for (const id of ids) {
    try {
      await fn(id);
      result.done++;
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() < 500) {
        result.skipped.push({ id, reason: messageOf(e) });
      } else {
        throw e;
      }
    }
  }
  return result;
}
