export const REPAIR_TIER = {
  Tier0: 0,
  Tier1: 1,
  Tier2: 2,
  Tier3: 3,
} as const;

export type RepairTier = (typeof REPAIR_TIER)[keyof typeof REPAIR_TIER];

export type RepairMotif =
  | 'numericBounds'
  | 'stringShape'
  | 'uniqueItems'
  | 'arraySizing'
  | 'typeEnumConst'
  | 'required'
  | 'contains'
  | 'propertiesCount'
  | 'apCleanup'
  | 'unevaluatedCleanup'
  | 'propertyNames'
  | 'other';

export type RepairTierReason = 'g_valid' | 'default_policy';

export const STRUCTURAL_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'enum',
  'const',
  'required',
  'minItems',
  'maxItems',
  'minContains',
  'maxContains',
  'minProperties',
  'maxProperties',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
]);

const MOTIF_TO_TIER: Record<RepairMotif, RepairTier> = {
  numericBounds: REPAIR_TIER.Tier1,
  stringShape: REPAIR_TIER.Tier1,
  uniqueItems: REPAIR_TIER.Tier1,
  arraySizing: REPAIR_TIER.Tier1,
  typeEnumConst: REPAIR_TIER.Tier2,
  required: REPAIR_TIER.Tier2,
  contains: REPAIR_TIER.Tier2,
  propertiesCount: REPAIR_TIER.Tier2,
  apCleanup: REPAIR_TIER.Tier2,
  unevaluatedCleanup: REPAIR_TIER.Tier2,
  propertyNames: REPAIR_TIER.Tier2,
  other: REPAIR_TIER.Tier2,
};

const KEYWORD_TO_MOTIF: Record<string, RepairMotif> = {
  // Tier 1 motifs — numeric bounds
  minimum: 'numericBounds',
  maximum: 'numericBounds',
  exclusiveMinimum: 'numericBounds',
  exclusiveMaximum: 'numericBounds',
  multipleOf: 'numericBounds',

  // Tier 1 motifs — string shape
  minLength: 'stringShape',
  maxLength: 'stringShape',
  pattern: 'stringShape',

  // Tier 1 motifs — uniqueness and pure sizing
  uniqueItems: 'uniqueItems',
  minItems: 'arraySizing',
  maxItems: 'arraySizing',

  // Tier 2 motifs — structural/value replacement
  type: 'typeEnumConst',
  enum: 'typeEnumConst',
  const: 'typeEnumConst',
  required: 'required',
  contains: 'contains',
  minContains: 'contains',
  maxContains: 'contains',
  minProperties: 'propertiesCount',
  maxProperties: 'propertiesCount',
  additionalProperties: 'apCleanup',
  unevaluatedProperties: 'unevaluatedCleanup',
  unevaluatedItems: 'unevaluatedCleanup',
  propertyNames: 'propertyNames',
};

export function getMotifForKeyword(keyword: string): RepairMotif {
  return KEYWORD_TO_MOTIF[keyword] ?? 'other';
}

export function classifyTierForMotif(motif: RepairMotif): RepairTier {
  // Default rule: any Repair motif that is not explicitly
  // enumerated falls back to Tier 2 unless it is a Tier-0
  // non-mutating operation, which should not call into this
  // classifier in the first place.
  return MOTIF_TO_TIER[motif] ?? REPAIR_TIER.Tier2;
}

export function classifyTierForKeyword(keyword: string): RepairTier {
  const motif = getMotifForKeyword(keyword);
  return classifyTierForMotif(motif);
}

export interface ActionTierContext {
  keyword: string;
  tier: RepairTier;
  inGValid: boolean;
  allowStructuralInGValid?: boolean;
  maxTier: RepairTier;
}

export interface ActionTierDecision {
  allowed: boolean;
  allowedMaxTier: RepairTier;
  reason?: RepairTierReason;
}

export function isActionAllowed(ctx: ActionTierContext): ActionTierDecision {
  const { keyword, tier, inGValid, allowStructuralInGValid, maxTier } = ctx;

  if (tier === REPAIR_TIER.Tier0) {
    return { allowed: true, allowedMaxTier: maxTier };
  }

  if (tier === REPAIR_TIER.Tier3) {
    return {
      allowed: false,
      allowedMaxTier: maxTier,
      reason: 'default_policy',
    };
  }

  if (!inGValid || allowStructuralInGValid) {
    const allowedByTier = tier <= maxTier;
    return {
      allowed: allowedByTier,
      allowedMaxTier: maxTier,
    };
  }

  const isStructural = STRUCTURAL_KEYWORDS.has(keyword);

  if (tier === REPAIR_TIER.Tier1 && isStructural) {
    return {
      allowed: false,
      allowedMaxTier: maxTier,
      reason: 'g_valid',
    };
  }

  if (tier === REPAIR_TIER.Tier2) {
    return {
      allowed: false,
      allowedMaxTier: maxTier,
      reason: 'g_valid',
    };
  }

  const allowedByTier = tier <= maxTier;
  return {
    allowed: allowedByTier,
    allowedMaxTier: maxTier,
  };
}
