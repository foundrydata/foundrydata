export interface RepairUsageByMotif {
  motifId: string;
  gValid: boolean;
  items: number;
  itemsWithRepair: number;
  actions: number;
}

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
    snapshot.repairUsageByMotif.push({
      motifId: event.motifId,
      gValid: event.gValid,
      items: 1,
      itemsWithRepair: event.actions > 0 ? 1 : 0,
      actions: event.actions,
    });
    return;
  }
  bucket.items += 1;
  if (event.actions > 0) {
    bucket.itemsWithRepair += 1;
    bucket.actions += event.actions;
  }
}
