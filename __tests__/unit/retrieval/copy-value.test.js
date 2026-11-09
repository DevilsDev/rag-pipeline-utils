"use strict";

const { copyValue } = require("../../../src/retrieval/copy-value");

describe("copyValue", () => {
  test("copies a __proto__ and a constructor key as plain own properties", () => {
    const source = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": "x", "ok": 1}',
    );
    const copy = copyValue(source);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.keys(copy).sort()).toEqual([
      "__proto__",
      "constructor",
      "ok",
    ]);
    expect(Object.getOwnPropertyDescriptor(copy, "__proto__").value).toEqual({
      polluted: true,
    });
    expect(copy.constructor).toBe("x");
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test("the copy shares no objects with the source", () => {
    const source = { a: { b: [1, { c: 2 }] } };
    const copy = copyValue(source);
    expect(copy).toEqual(source);
    expect(copy.a).not.toBe(source.a);
    expect(copy.a.b).not.toBe(source.a.b);
    expect(copy.a.b[1]).not.toBe(source.a.b[1]);
  });

  test("keeps a Float32Array vector as a separate Float32Array", () => {
    const vector = new Float32Array([0.5, 1.5, -2]);
    const copy = copyValue({ vector }).vector;
    expect(copy).toBeInstanceOf(Float32Array);
    expect(copy).not.toBe(vector);
    expect(Array.from(copy)).toEqual([0.5, 1.5, -2]);
    vector[0] = 9;
    expect(copy[0]).toBe(0.5);
  });

  test("keeps a Date and a Buffer", () => {
    const date = new Date(1700000000000);
    const buf = Buffer.from("hello");
    const copy = copyValue({ date, buf });
    expect(copy.date).toBeInstanceOf(Date);
    expect(copy.date).not.toBe(date);
    expect(copy.date.getTime()).toBe(1700000000000);
    expect(Buffer.isBuffer(copy.buf)).toBe(true);
    expect(copy.buf).not.toBe(buf);
    expect(copy.buf.toString()).toBe("hello");
  });

  test("copies an ArrayBuffer", () => {
    const ab = new Uint8Array([1, 2, 3]).buffer;
    const copy = copyValue({ ab }).ab;
    expect(copy).toBeInstanceOf(ArrayBuffer);
    expect(copy).not.toBe(ab);
    expect(Array.from(new Uint8Array(copy))).toEqual([1, 2, 3]);
  });

  test("copies arrays nested in objects", () => {
    const copy = copyValue({ tags: ["a", "b"], rows: [[1], [2]] });
    expect(copy).toEqual({ tags: ["a", "b"], rows: [[1], [2]] });
  });

  test("returns primitives and null unchanged", () => {
    expect(copyValue(null)).toBeNull();
    expect(copyValue(3)).toBe(3);
    expect(copyValue("s")).toBe("s");
  });

  test("copies a Map and a Set with nested objects", () => {
    const key = { id: 1 };
    const map = new Map([[key, { tags: ["a"] }]]);
    const set = new Set([{ n: 1 }]);
    const copy = copyValue({ map, set });
    expect(copy.map).toBeInstanceOf(Map);
    expect(copy.set).toBeInstanceOf(Set);
    expect(copy.map).not.toBe(map);
    const [[copyKey, copyVal]] = [...copy.map];
    expect(copyKey).toEqual({ id: 1 });
    expect(copyKey).not.toBe(key);
    expect(copyVal).toEqual({ tags: ["a"] });
    expect(copyVal).not.toBe(map.get(key));
    const [item] = [...copy.set];
    expect(item).toEqual({ n: 1 });
    expect(item).not.toBe([...set][0]);
  });

  test("a self-referencing object becomes a self-referencing copy", () => {
    const source = { name: "loop" };
    source.self = source;
    const copy = copyValue(source);
    expect(copy).not.toBe(source);
    expect(copy.self).toBe(copy);
    expect(copy.name).toBe("loop");
  });

  test("a cycle through an array is kept, pointing at copies", () => {
    const source = { id: 1 };
    source.list = [source];
    const copy = copyValue(source);
    expect(copy).not.toBe(source);
    expect(copy.list).not.toBe(source.list);
    expect(copy.list[0]).toBe(copy);
  });

  test("a cycle through a Map is kept, pointing at copies", () => {
    const map = new Map();
    map.set("me", map);
    const source = { map };
    map.set("owner", source);
    const copy = copyValue(source);
    expect(copy.map).not.toBe(map);
    expect(copy.map.get("me")).toBe(copy.map);
    expect(copy.map.get("owner")).toBe(copy);
  });

  test("a value reachable twice stays one shared object in the copy", () => {
    const shared = { x: 1 };
    const source = { a: shared, b: [shared] };
    const copy = copyValue(source);
    expect(copy).toEqual({ a: { x: 1 }, b: [{ x: 1 }] });
    expect(copy.a).not.toBe(shared);
    expect(copy.b[0]).toBe(copy.a);
  });
});
