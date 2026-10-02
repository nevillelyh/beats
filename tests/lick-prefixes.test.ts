import { describe, expect, test } from "bun:test";
import { lickPrefix, lickPrefixGroups } from "../src/static/lick-prefixes.js";

const series = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);

describe("lick prefixes", () => {
  test("trims numbering separators while preserving series codes", () => {
    for (const name of ["ex01", "ex <01>", "ex#1", "ex #1", "ex-01", " ex [01] "]) {
      expect(lickPrefix(name)).toBe("ex");
    }
    expect(lickPrefix("MGL1 #11 Melodic Metal Riff")).toBe("MGL1");
    expect(lickPrefix("MGL1#05 Scales")).toBe("MGL1");
    expect(lickPrefix("WW228.5 Ascending Sweet 16's")).toBe("WW");
    expect(lickPrefix("S2E2 Volcano Pattern")).toBe("S2E2");
    expect(lickPrefix("S2E20 Other Episode")).toBe("S2E20");
    expect(lickPrefix("10CL01 Cascading Major")).toBe("10CL01");
    expect(lickPrefix("EJ Classic Fives")).toBe("EJ");
    expect(lickPrefix("123")).toBe("");
    expect(lickPrefix("")).toBe("");
  });

  test("requires 25 distinct titles and two groups of at least five", () => {
    expect(lickPrefixGroups([...series("A", 19), ...series("B", 5)])).toEqual([]);
    expect(lickPrefixGroups([...series("A", 21), ...series("B", 4)])).toEqual([]);
    const names = [...series("A", 20), ...series("B", 5)];
    expect(lickPrefixGroups([...names, ...names])).toEqual([
      { prefix: "A", count: 20 },
      { prefix: "B", count: 5 },
    ]);
    expect(lickPrefixGroups([...series("A", 10), ...series("B", 4), ...series("B", 4)])).toEqual([]);
  });

  test("uses broad word prefixes instead of overlapping child groups", () => {
    const names = [
      ...series("DWPS Six-Note Pattern Phrygian ", 6),
      ...series("DWPS Six-Note Pattern ", 6),
      ...series("DWPS Fours ", 3),
      ...series("EJ ", 5),
      ...series("S2E2 ", 5),
    ];
    expect(lickPrefixGroups(names)).toEqual([
      { prefix: "DWPS", count: 15 },
      { prefix: "EJ", count: 5 },
      { prefix: "S2E2", count: 5 },
    ]);
  });

  test("keeps Japanese series separate at attached number boundaries", () => {
    expect(lickPrefixGroups([
      ...series("地獄", 10),
      ...series("地獄の反逆", 10),
      ...series("地獄の愛と昇天", 5),
    ])).toEqual([
      { prefix: "地獄", count: 10 },
      { prefix: "地獄の反逆", count: 10 },
      { prefix: "地獄の愛と昇天", count: 5 },
    ]);
  });

  test("groups case variants and numbered and unnumbered titles together", () => {
    expect(lickPrefixGroups([
      ...series("ex#", 4), "EX Repeater", ...series("WW", 20),
    ])).toEqual([
      { prefix: "ex", count: 5 },
      { prefix: "WW", count: 20 },
    ]);
  });
});
