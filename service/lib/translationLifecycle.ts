/** Each language request belongs to one immutable answer/input scope. */
export function createTranslationRequests() {
  let sequence = 0;
  let active: { sequence: number; scope: string; controller: AbortController } | null = null;
  function cancel() {
    active?.controller.abort();
    active = null;
    sequence += 1;
  }
  return {
    cancel,
    begin(scope: string) {
      cancel();
      const token = { sequence, scope, controller: new AbortController() };
      active = token;
      return token;
    },
    isCurrent(token: { sequence: number; scope: string }) {
      return active !== null && active.sequence === token.sequence && active.scope === token.scope && !active.controller.signal.aborted;
    },
  };
}

/** The API reports contract rejection separately from network/provider failures. */
export function translationFailureStatus(message: string): "rejected" | "failed" {
  return /숫자 보존 위반|줄 \d+.*(?:두 번|없)|줄 수|번역.*형식/.test(message) ? "rejected" : "failed";
}
