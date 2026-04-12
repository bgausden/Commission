import { describe, expect, it } from "vitest";
import { parseStaffHurdles } from "./staffHurdles.js";

describe("parseStaffHurdles", () => {
  it("trims whitespace from staff ID keys", () => {
    const staffHurdles = parseStaffHurdles({
      " 012 ": {
        staffName: "Kate",
        baseRate: 0,
        hurdle1Level: 30000,
        hurdle1Rate: 0.11,
        contractor: false,
        payViaTalenox: true,
      },
    });

    expect(staffHurdles.has("012")).toBe(true);
    expect([...staffHurdles.keys()]).toEqual(["012"]);
  });

  it("returns the original hurdle object values", () => {
    const kate = {
      staffName: "Kate",
      baseRate: 0,
      hurdle1Level: 30000,
      hurdle1Rate: 0.11,
      contractor: false,
      payViaTalenox: true,
    };

    const staffHurdles = parseStaffHurdles({
      "012": kate,
      "000": {
        staffName: "Default",
        baseRate: 0,
        hurdle1Level: 20000,
        hurdle1Rate: 0.1,
        contractor: false,
        payViaTalenox: true,
      },
    });

    expect(staffHurdles.get("012")).toBe(kate);
  });
});
