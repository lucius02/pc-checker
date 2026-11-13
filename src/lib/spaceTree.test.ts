import { describe, expect, it } from "vitest";
import type { SpaceEntry, SpaceReport } from "../types";
import { folderRows, isVolumeRoot, parentDir, resolveTrail, unaccountedBytes } from "./spaceTree";

const GB = 1024 ** 3;

function entry(path: string, size: number, children: SpaceEntry[] = [], extra: Partial<SpaceEntry> = {}): SpaceEntry {
  return {
    name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    path,
    size_bytes: size,
    file_count: 0,
    dir_count: children.length,
    own_files_bytes: 0,
    own_file_count: 0,
    children,
    other_bytes: 0,
    other_count: 0,
    access_denied: false,
    ...extra,
  };
}

function report(root: SpaceEntry, extra: Partial<SpaceReport> = {}): SpaceReport {
  return {
    root,
    scanned_at: "t",
    duration_ms: 1,
    largest_files: [],
    skipped_dirs: 0,
    cancelled: false,
    is_elevated: false,
    volume_mount: "C:\\",
    volume_total_bytes: 500 * GB,
    volume_available_bytes: 100 * GB,
    ...extra,
  };
}

const users = entry("C:\\Users", 200 * GB, [entry("C:\\Users\\me", 190 * GB)]);
const root = entry("C:\\", 380 * GB, [entry("C:\\Windows", 30 * GB), users], {
  own_file_count: 3,
  own_files_bytes: 40 * GB,
  other_count: 12,
  other_bytes: 110 * GB,
});

describe("spaceTree", () => {
  it("follows the trail and stops at unknown paths", () => {
    expect(resolveTrail(root, ["C:\\Users", "C:\\Users\\me"]).map((e) => e.path)).toEqual(["C:\\", "C:\\Users", "C:\\Users\\me"]);
    expect(resolveTrail(root, ["C:\\Nope", "C:\\Users"]).map((e) => e.path)).toEqual(["C:\\"]);
  });

  it("lists folders, loose files and grouped folders by size", () => {
    expect(folderRows(root).map((r) => r.key)).toEqual(["C:\\Users", "__other", "__files", "C:\\Windows"]);
    expect(folderRows(entry("x", 0))).toEqual([]);
  });

  it("detects whole-volume scans case- and slash-insensitively", () => {
    expect(isVolumeRoot(report(entry("c:/", 1)))).toBe(true);
    expect(isVolumeRoot(report(users))).toBe(false);
    expect(isVolumeRoot(report(entry("/", 1), { volume_mount: "/" }))).toBe(true);
  });

  it("reports unaccounted space only for meaningful gaps on full scans", () => {
    expect(unaccountedBytes(report(root))).toBe(20 * GB);
    expect(unaccountedBytes(report(root, { cancelled: true }))).toBe(0);
    expect(unaccountedBytes(report(users))).toBe(0);
    expect(unaccountedBytes(report(entry("C:\\", 399.5 * GB)))).toBe(0);
  });

  it("gets the parent folder of a file", () => {
    expect(parentDir("C:\\Users\\me\\big.iso")).toBe("C:\\Users\\me");
    expect(parentDir("/home/me/big.iso")).toBe("/home/me");
  });

});
