import { describe, expect, it } from "vitest";
import { compareDisk, rateSpeed } from "./diskReference";

describe("rateSpeed", () => {
  it("rates the reference NVMe drive (990 EVO Plus) as fast to read and normal to write", () => {
    expect(compareDisk({ read_mbps: 2262, write_mbps: 1205, drive_kind: "nvme", drive_model: null, cache_bypassed: true })).toEqual({
      baseline: "nvme3",
      read: "fast",
      write: "ok",
    });
  });
  it("judges read and write separately", () => {
    expect(rateSpeed("ssd", "read", 500)).toBe("ok");
    expect(rateSpeed("ssd", "write", 150)).toBe("bad");
  });
  it("flags a slow drive for its type", () => {
    expect(rateSpeed("nvme", "read", 700)).toBe("slow");
    expect(rateSpeed("hdd", "read", 40)).toBe("bad");
    expect(rateSpeed("hdd", "read", 190)).toBe("fast");
  });
  it("gives no verdict for USB or unknown drives", () => {
    expect(rateSpeed("usb", "read", 300)).toBeNull();
    expect(rateSpeed("unknown", "write", 300)).toBeNull();
  });
});
