// In-house zero-dependency Result type matching @badrap/result contract
abstract class _Result<T, E extends Error = Error> {
  protected abstract _chain<X, U extends Error>(
    ok: (value: T) => Result<X, U>,
    err: (error: E) => Result<X, U>,
  ): Result<X, U>;

  unwrap(): T;
  unwrap<U>(ok: (value: T) => U): U;
  unwrap<U, V>(ok: (value: T) => U, err: (error: E) => V): U | V;
  unwrap<U>(ok: (value: T) => U, err: (error: E) => U): U;
  unwrap(ok?: (value: T) => unknown, err?: (error: E) => unknown): unknown {
    const r = this._chain(
      (value) => Result.ok(ok ? ok(value) : value),
      (error) => (err ? Result.ok(err(error)) : Result.err(error)),
    );
    if (r.isErr) {
      throw r.error;
    }
    return r.value;
  }

  map<U>(ok: (value: T) => U): Result<U, E>;
  map<U, F extends Error>(
    ok: (value: T) => U,
    err: (error: E) => F,
  ): Result<U, F>;
  map(ok: (value: T) => unknown, err?: (error: E) => Error): Result<unknown> {
    return this._chain(
      (value) => Result.ok(ok(value)),
      (error) => Result.err(err ? err(error) : error),
    );
  }

  chain<X>(ok: (value: T) => Result<X, E>): Result<X, E>;
  chain<X>(
    ok: (value: T) => Result<X, E>,
    err: (error: E) => Result<X, E>,
  ): Result<X, E>;
  chain<X, U extends Error>(
    ok: (value: T) => Result<X, U>,
    err: (error: E) => Result<X, U>,
  ): Result<X, U>;
  chain(
    ok: (value: T) => Result<unknown>,
    err?: (error: E) => Result<unknown>,
  ): Result<unknown> {
    return this._chain(ok, err ?? ((error) => Result.err(error)));
  }
}

export class _Ok<T, E extends Error = Error> extends _Result<T, E> {
  readonly isOk = true as const;
  readonly isErr = false as const;
  constructor(readonly value: T) {
    super();
  }

  protected _chain<X, U extends Error>(
    ok: (value: T) => Result<X, U>,
    _err: (error: E) => Result<X, U>,
  ): Result<X, U> {
    return ok(this.value);
  }
}

export class _Err<T, E extends Error = Error> extends _Result<T, E> {
  readonly isOk = false as const;
  readonly isErr = true as const;
  constructor(readonly error: E) {
    super();
  }

  protected _chain<X, U extends Error>(
    _ok: (value: T) => Result<X, U>,
    err: (error: E) => Result<X, U>,
  ): Result<X, U> {
    return err(this.error);
  }
}

export type Result<T, E extends Error = Error> = _Ok<T, E> | _Err<T, E>;

export namespace Result {
  export type Ok<T, E extends Error = Error> = _Ok<T, E>;
  export type Err<T, E extends Error = Error> = _Err<T, E>;

  export function ok<T, E extends Error = Error>(value: T): Result<T, E> {
    return new _Ok(value);
  }
  export function err<E extends Error, T = never>(error?: E): Result<T, E>;
  export function err<E extends Error, T = never>(error?: E): Result<T, E> {
    return new _Err((error || new Error()) as E);
  }
}
