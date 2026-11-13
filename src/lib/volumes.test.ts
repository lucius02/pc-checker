import { describe, expect, it } from "vitest";
import type { DiskInfo } from "../types";
import { uniqueStorage } from "./volumes";

const total = (disks: DiskInfo[]) => uniqueStorage(disks).reduce((acc, d) => acc + d.total_bytes, 0);

const GB = 1024 ** 3;
const disk = (mount_point: string, storage_id: string, total_bytes: number): DiskInfo => ({
  name: storage_id,
  mount_point,
  file_system: "btrfs",
  total_bytes,
  available_bytes: total_bytes / 2,
  is_removable: false,
  disk_type: "SSD",
  storage_id,
});

describe("volumes", () => {
  it("counts btrfs subvolumes on one device once", () => {
    const disks = [
      disk("/", "/dev/mapper/root", 487 * GB),
      disk("/home", "/dev/mapper/root", 487 * GB),
      disk("/var/log", "/dev/mapper/root", 487 * GB),
      disk("/boot", "/dev/sda1", 2 * GB),
    ];
    expect(uniqueStorage(disks).map((d) => d.mount_point)).toEqual(["/", "/boot"]);
    expect(total(disks)).toBe(489 * GB);
  });

  it("keeps separate drives apart, also without a storage id", () => {
    const disks = [disk("C:\\", "C:\\", 500 * GB), disk("D:\\", "D:\\", 1000 * GB), disk("E:\\", "", 64 * GB)];
    expect(total(disks)).toBe(1564 * GB);
  });
});
