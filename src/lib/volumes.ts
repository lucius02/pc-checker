import type { DiskInfo } from "../types";

/**
 * Eén volume per onderliggende opslag. Op Linux staan btrfs-subvolumes (`/`, `/home`,
 * `/var/log`) als losse volumes in de lijst, maar ze delen één schijf en melden allemaal de
 * volle capaciteit; zonder ontdubbelen telt die schijf meerdere keren mee. Het eerste
 * koppelpunt per opslag blijft staan (meestal `/`).
 */
export function uniqueStorage(disks: DiskInfo[]): DiskInfo[] {
  const seen = new Set<string>();
  return disks.filter((d) => {
    const id = d.storage_id || d.mount_point;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
