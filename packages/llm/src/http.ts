import { ProjectError } from "@project/domain";

export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 120_000;
export const DEFAULT_LLM_MAX_RESPONSE_BYTES = 4_000_000;

export interface BoundedJsonPostOptions {
  readonly providerName: string;
  readonly fetchImpl: typeof fetch;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  /** Deadline for the whole call: connection, headers and the complete response body. */
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  /** Caller cancellation, e.g. the generation execution deadline. */
  readonly signal?: AbortSignal;
}

export interface BoundedJsonResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

export function retryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

class AbortedCall extends Error {}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortedCall());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AbortedCall());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.aborted ? new AbortedCall() : error);
      },
    );
  });
}

async function readBoundedText(
  response: Response,
  options: BoundedJsonPostOptions,
  signal: AbortSignal,
): Promise<string> {
  const tooLarge = () =>
    new ProjectError({
      code: "process_error",
      stage: "planning",
      message: `${options.providerName} response exceeded ${options.maxResponseBytes} bytes`,
      retryable: true,
      details: { httpStatus: response.status, maxResponseBytes: options.maxResponseBytes },
    });

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (response.body === null) {
    const text = await untilAborted(response.text(), signal);
    if (Buffer.byteLength(text) > options.maxResponseBytes) throw tooLarge();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) break;
      received += value.byteLength;
      if (received > options.maxResponseBytes) throw tooLarge();
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

/**
 * POSTs JSON and reads a bounded JSON response under one deadline. Every failure is a typed
 * `process_error` in the planning stage; timeouts and cancellations are retryable so the
 * existing failover policy can apply.
 */
export async function postJsonBounded(options: BoundedJsonPostOptions): Promise<BoundedJsonResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs);
  timer.unref?.();
  const signal = options.signal === undefined
    ? timeout.signal
    : AbortSignal.any([options.signal, timeout.signal]);

  const abortedError = (cause: unknown) =>
    options.signal?.aborted
      ? new ProjectError({
          code: "process_error",
          stage: "planning",
          message: `${options.providerName} request was cancelled by the generation deadline`,
          retryable: true,
          details: { cancelled: true },
          cause,
        })
      : new ProjectError({
          code: "process_error",
          stage: "planning",
          message: `${options.providerName} request timed out after ${options.timeoutMs} ms`,
          retryable: true,
          details: { timeoutMs: options.timeoutMs },
          cause,
        });

  try {
    let response: Response;
    try {
      response = await untilAborted(
        options.fetchImpl(options.url, {
          method: "POST",
          headers: options.headers,
          body: options.body,
          signal,
        }),
        signal,
      );
    } catch (error) {
      if (error instanceof AbortedCall || signal.aborted) throw abortedError(error);
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `${options.providerName} request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
        cause: error,
      });
    }

    let text: string;
    try {
      text = await readBoundedText(response, options, signal);
    } catch (error) {
      if (error instanceof ProjectError) throw error;
      if (error instanceof AbortedCall || signal.aborted) throw abortedError(error);
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `${options.providerName} response body could not be read (status ${response.status})`,
        retryable: true,
        details: { httpStatus: response.status },
        cause: error,
      });
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `${options.providerName} returned a non-JSON HTTP response (status ${response.status})`,
        retryable: retryableHttpStatus(response.status),
        details: { httpStatus: response.status },
        cause: error,
      });
    }
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timer);
  }
}
