/** Run independent account probes with a small ceiling, preserving input order. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, map: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await map(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
