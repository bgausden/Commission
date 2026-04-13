import { describe, expect, it, vi } from "vitest";
import { Option } from "./option.js";

describe("Option.some", () => {
  it("fold calls onSome with the wrapped value", () => {
    const onSome = vi.fn((x: number) => x * 2);
    const onNone = vi.fn(() => -1);
    const result = Option.some(5).fold(onSome, onNone);
    expect(result).toBe(10);
    expect(onSome).toHaveBeenCalledWith(5);
    expect(onNone).not.toHaveBeenCalled();
  });

  it("map applies the function and returns a new Some", () => {
    const result = Option.some(3).map((x) => x + 1);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe(4);
  });

  it("flatMap applies the function and returns its result directly", () => {
    const result = Option.some(3).flatMap((x) => Option.some(x * 10));
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe(30);
  });

  it("flatMap returns none when the function returns none", () => {
    const result = Option.some(3).flatMap(() => Option.none);
    expect(Option.isNone(result)).toBe(true);
  });

  it("getOrElse returns the wrapped value, not the default", () => {
    expect(Option.some(42).getOrElse(0)).toBe(42);
  });

  it("isSome returns true", () => {
    expect(Option.isSome(Option.some("x"))).toBe(true);
  });

  it("isNone returns false", () => {
    expect(Option.isNone(Option.some("x"))).toBe(false);
  });
});

describe("Option.none", () => {
  it("fold calls onNone and does not call onSome", () => {
    const onSome = vi.fn(() => "some");
    const onNone = vi.fn(() => "none");
    const result = Option.none.fold(onSome, onNone);
    expect(result).toBe("none");
    expect(onNone).toHaveBeenCalled();
    expect(onSome).not.toHaveBeenCalled();
  });

  it("map returns none and does not call the mapping function", () => {
    const fn = vi.fn((x: number) => x + 1);
    const result = Option.none.map(fn);
    expect(Option.isNone(result)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flatMap returns none and does not call the mapping function", () => {
    const fn = vi.fn(() => Option.some(99));
    const result = Option.none.flatMap(fn);
    expect(Option.isNone(result)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("getOrElse returns the default value", () => {
    expect(Option.none.getOrElse(99)).toBe(99);
  });

  it("isSome returns false", () => {
    expect(Option.isSome(Option.none)).toBe(false);
  });

  it("isNone returns true", () => {
    expect(Option.isNone(Option.none)).toBe(true);
  });
});

describe("Option.fromNullable", () => {
  it("returns none for null", () => {
    expect(Option.isNone(Option.fromNullable(null))).toBe(true);
  });

  it("returns none for undefined", () => {
    expect(Option.isNone(Option.fromNullable(undefined))).toBe(true);
  });

  it("returns some for falsy-but-non-null value 0", () => {
    const result = Option.fromNullable(0);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe(0);
  });

  it("returns some for falsy-but-non-null value empty string", () => {
    const result = Option.fromNullable("");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe("");
  });

  it("returns some for a truthy value", () => {
    const result = Option.fromNullable("hello");
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe("hello");
  });
});

describe("Option chaining", () => {
  it("map composes: some(x).map(f).map(g) = some(g(f(x)))", () => {
    const result = Option.some(2)
      .map((x) => x * 3)
      .map((x) => x + 1);
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) expect(result.value).toBe(7);
  });

  it("flatMap chain that ends in none resolves to the default via getOrElse", () => {
    const result = Option.some(5)
      .flatMap(() => Option.none)
      .getOrElse(42);
    expect(result).toBe(42);
  });
});
