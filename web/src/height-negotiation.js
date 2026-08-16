const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const normalize = (value) => Math.round(value * 1000) / 1000;

export function validateHeightNegotiation(value) {
  if (value == null) return null;
  if (typeof value !== "object" || typeof value.getBaselineHeight !== "function" || typeof value.requestPreferredHeight !== "function") {
    throw new TypeError("heightNegotiation requires getBaselineHeight(context) and requestPreferredHeight(request)");
  }
  return value;
}

export function createHeightNegotiator(canvas, adapter, reportError) {
  let destroyed = false;
  let generation = null;
  let controller = null;
  let serial = 0;

  const abort = () => {
    controller?.abort();
    controller = null;
    generation = null;
  };
  const safeReport = (error, context) => {
    try { reportError?.(error, Object.freeze({ phase: "height-negotiation", ...context })); } catch { /* Host reporting cannot destabilize the controller. */ }
  };

  const baseline = (width, currentHeight) => {
    if (!adapter || destroyed || !finitePositive(width) || !finitePositive(currentHeight)) return { value: null, error: null };
    try {
      const value = adapter.getBaselineHeight(Object.freeze({ canvas, width, currentHeight }));
      return { value: finitePositive(value) ? normalize(value) : null, error: null };
    } catch (error) {
      return { value: null, error };
    }
  };

  const commit = ({ contractRevision, width, baselineHeight, preferredHeight, baselineError = null }) => {
    if (!adapter || destroyed) return;
    if (baselineError) {
      abort();
      safeReport(baselineError, { operation: "baseline", width, baselineHeight: null, preferredHeight: null });
      return;
    }
    if (![width, baselineHeight, preferredHeight].every(finitePositive)) { abort(); return; }
    const key = `${contractRevision}:${normalize(width)}:${normalize(baselineHeight)}`;
    if (key !== generation) {
      abort();
      generation = key;
      controller = new AbortController();
    }
    const requestHeight = normalize(preferredHeight);
    if (controller.requestedHeight === requestHeight) return;
    controller.requestedHeight = requestHeight;
    const requestController = controller;
    const requestSerial = ++serial;
    queueMicrotask(() => {
      if (destroyed || requestController.signal.aborted || requestSerial !== serial || requestController !== controller) return;
      try {
        const returned = adapter.requestPreferredHeight(Object.freeze({
          preferredHeight: requestHeight,
          baselineHeight: normalize(baselineHeight),
          width: normalize(width),
          signal: requestController.signal,
        }));
        // Promise fulfillment is not an acknowledgement. Rejection is observed only
        // to prevent an unhandled host error; it never retries or changes layout state.
        if (returned && typeof returned.then === "function") Promise.resolve(returned).catch((error) => {
          safeReport(error, { operation: "request", width: normalize(width), baselineHeight: normalize(baselineHeight), preferredHeight: requestHeight });
        });
      } catch (error) {
        safeReport(error, { operation: "request", width: normalize(width), baselineHeight: normalize(baselineHeight), preferredHeight: requestHeight });
      }
    });
  };

  return Object.freeze({ baseline, commit, abort, destroy() { if (destroyed) return; destroyed = true; abort(); serial += 1; } });
}
