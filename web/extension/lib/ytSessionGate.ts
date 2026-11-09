/** Small, side-effect-free state gate for YouTube's rejected-session handling. */
export class YtSessionGate {
  #rejected = false;

  get rejected(): boolean {
    return this.#rejected;
  }

  markRejected(): void {
    this.#rejected = true;
  }

  invalidate(): void {
    this.#rejected = false;
  }

  /** Explicit user refresh is a new probe, even if no cookie changed. */
  recoverForRefresh(refresh: boolean): boolean {
    if (!refresh || !this.#rejected) return false;
    this.#rejected = false;
    return true;
  }
}
