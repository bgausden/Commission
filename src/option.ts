export interface Option<T> {
  readonly _tag: "Some" | "None";
  fold<R>(onSome: (value: T) => R, onNone: () => R): R;
  map<U>(fn: (value: T) => U): Option<U>;
  flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  getOrElse(defaultValue: T): T;
}

export interface Some<T> extends Option<T> {
  readonly _tag: "Some";
  readonly value: T;
}

export interface None extends Option<never> {
  readonly _tag: "None";
}

// eslint-disable-next-line no-redeclare -- Option is intentionally both a type and a value namespace.
export namespace Option {
  const noneInstance: None = {
    _tag: "None",
    fold: (_onSome, onNone) => onNone(),
    map: () => noneInstance,
    flatMap: () => noneInstance,
    getOrElse: (defaultValue) => defaultValue,
  };

  export const none: None = noneInstance;

  export function some<T>(value: T): Some<T> {
    return {
      _tag: "Some",
      value,
      fold: (onSome, _onNone) => onSome(value),
      map: (fn) => some(fn(value)),
      flatMap: (fn) => fn(value),
      getOrElse: (_defaultValue) => value,
    };
  }

  export function fromNullable<T>(value: T | null | undefined): Option<T> {
    return value == null ? none : some(value);
  }

  // Backward-compatible helpers
  export function fold<T, R>(
    option: Option<T>,
    onSome: (value: T) => R,
    onNone: () => R,
  ): R {
    return option.fold(onSome, onNone);
  }

  export function map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
    return option.map(fn);
  }

  export function flatMap<T, U>(
    option: Option<T>,
    fn: (value: T) => Option<U>,
  ): Option<U> {
    return option.flatMap(fn);
  }

  export function getOrElse<T>(option: Option<T>, defaultValue: T): T {
    return option.getOrElse(defaultValue);
  }

  export function isSome<T>(option: Option<T>): option is Some<T> {
    return option._tag === "Some";
  }

  export function isNone<T>(option: Option<T>): option is None {
    return option._tag === "None";
  }
}
