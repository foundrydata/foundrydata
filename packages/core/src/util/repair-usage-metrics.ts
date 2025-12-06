import type { RepairUsageByMotif } from '@foundrydata/shared';

export interface RepairUsageSnapshot {
  repairUsageByMotif?: RepairUsageByMotif[];
}

export function recordRepairUsageEventOnSnapshot(
  snapshot: RepairUsageSnapshot,
  event: {
    motifId: string;
    gValid: boolean;
    actions: number;
  }
): void {
  if (!snapshot.repairUsageByMotif) {
    snapshot.repairUsageByMotif = [];
  }
  const bucket = snapshot.repairUsageByMotif.find(
    (entry) => entry.motifId === event.motifId && entry.gValid === event.gValid
  );
  if (!bucket) {
    const newEntry = {
      motifId: event.motifId,
      gValid: event.gValid,
      items: 1,
      itemsWithRepair: event.actions > 0 ? 1 : 0,
      actions: event.actions,
    };
    snapshot.repairUsageByMotif.push(newEntry);
    addGValidCounters(snapshot, newEntry);
    return;
  }
  bucket.items += 1;
  if (event.actions > 0) {
    bucket.itemsWithRepair += 1;
    bucket.actions += event.actions;
  }
  addGValidCounters(snapshot, bucket, event.actions);
}

function addGValidCounters(
  snapshot: RepairUsageSnapshot,
  bucket: { motifId: string; gValid: boolean; actions: number },
  actionsOverride?: number
): void {
  if (!bucket.gValid) return;
  if (!bucket.motifId || bucket.motifId === 'none') return;

  const actions = actionsOverride ?? bucket.actions;
  const base = `gValid_${bucket.motifId}`;
  const metrics = snapshot as Record<string, number | RepairUsageSnapshot>;

  const increment = (key: string, delta: number): void => {
    const current =
      typeof metrics[key] === 'number' ? (metrics[key] as number) : 0;
    metrics[key] = current + delta;
  };

  increment(`${base}_items`, 1);
  const itemsWithRepairKey = `${base}_itemsWithRepair`;
  const actionsKey = `${base}_actions`;
  if (metrics[itemsWithRepairKey] === undefined) {
    metrics[itemsWithRepairKey] = 0;
  }
  if (metrics[actionsKey] === undefined) {
    metrics[actionsKey] = 0;
  }
  if (actions > 0) {
    increment(itemsWithRepairKey, 1);
    increment(actionsKey, actions);
  }
}
