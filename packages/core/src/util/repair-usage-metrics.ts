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
    items?: number;
    itemsWithRepair?: number;
  }
): void {
  if (!snapshot.repairUsageByMotif) {
    snapshot.repairUsageByMotif = [];
  }
  const itemsDelta = event.items ?? 1;
  const itemsWithRepairDelta =
    event.itemsWithRepair ?? (event.actions > 0 ? 1 : 0);
  const bucket = snapshot.repairUsageByMotif.find(
    (entry) => entry.motifId === event.motifId && entry.gValid === event.gValid
  );
  if (!bucket) {
    const newEntry = {
      motifId: event.motifId,
      gValid: event.gValid,
      items: itemsDelta,
      itemsWithRepair: itemsWithRepairDelta,
      actions: event.actions,
    };
    snapshot.repairUsageByMotif.push(newEntry);
    addGValidCounters(snapshot, newEntry, {
      itemsDelta,
      itemsWithRepairDelta,
      actionsDelta: event.actions,
    });
    return;
  }
  bucket.items += itemsDelta;
  if (event.actions > 0 || itemsWithRepairDelta > 0) {
    bucket.itemsWithRepair += itemsWithRepairDelta;
    bucket.actions += event.actions;
  }
  addGValidCounters(snapshot, bucket, {
    itemsDelta,
    itemsWithRepairDelta,
    actionsDelta: event.actions,
  });
}

// eslint-disable-next-line complexity
function addGValidCounters(
  snapshot: RepairUsageSnapshot,
  bucket: { motifId: string; gValid: boolean; actions: number },
  deltas?: {
    itemsDelta?: number;
    itemsWithRepairDelta?: number;
    actionsDelta?: number;
  }
): void {
  if (!bucket.gValid || !bucket.motifId || bucket.motifId === 'none') return;

  const actions = deltas?.actionsDelta ?? bucket.actions;
  const itemsDelta = deltas?.itemsDelta ?? 1;
  const itemsWithRepairDelta = deltas?.itemsWithRepairDelta ?? 0;
  const base = `gValid_${bucket.motifId}`;
  const metrics = snapshot as Record<string, number | RepairUsageSnapshot>;

  const itemsKey = `${base}_items`;
  const itemsWithRepairKey = `${base}_itemsWithRepair`;
  const actionsKey = `${base}_actions`;

  const currentItems =
    typeof metrics[itemsKey] === 'number' ? (metrics[itemsKey] as number) : 0;
  metrics[itemsKey] = currentItems + Math.max(0, itemsDelta);

  const currentItemsWithRepair =
    typeof metrics[itemsWithRepairKey] === 'number'
      ? (metrics[itemsWithRepairKey] as number)
      : 0;
  metrics[itemsWithRepairKey] =
    currentItemsWithRepair + Math.max(0, itemsWithRepairDelta);

  const currentActions =
    typeof metrics[actionsKey] === 'number'
      ? (metrics[actionsKey] as number)
      : 0;
  metrics[actionsKey] = currentActions + Math.max(0, actions);
}
