import { describe, it, expect } from 'vitest';
import {
  REPAIR_TIER,
  classifyTierForKeyword,
  classifyTierForMotif,
  getMotifForKeyword,
  isActionAllowed,
  STRUCTURAL_KEYWORDS,
} from '../tier-classification.js';

describe('Repair tier classification — §10.P8 baseline', () => {
  it('classifies Tier 1 keywords (numeric bounds, string shape, uniqueness, sizing) as Tier 1', () => {
    const tier1Keywords = [
      // numeric bounds
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'multipleOf',
      // string shape
      'minLength',
      'maxLength',
      'pattern',
      // uniqueness and array sizing
      'uniqueItems',
      'minItems',
      'maxItems',
    ];

    for (const keyword of tier1Keywords) {
      expect(classifyTierForKeyword(keyword)).toBe(REPAIR_TIER.Tier1);
    }
  });

  it('classifies Tier 2 structural/value replacement keywords as Tier 2', () => {
    const tier2Keywords = [
      // value replacement
      'type',
      'enum',
      'const',
      // structural completion
      'required',
      'contains',
      'minContains',
      'maxContains',
      'minProperties',
      'maxProperties',
      'additionalProperties',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
    ];

    for (const keyword of tier2Keywords) {
      expect(classifyTierForKeyword(keyword)).toBe(REPAIR_TIER.Tier2);
    }
  });

  it('falls back to Tier 2 for unlisted keywords', () => {
    const unknownKeywords = ['if', 'then', 'else', 'patternProperties'];
    for (const keyword of unknownKeywords) {
      expect(classifyTierForKeyword(keyword)).toBe(REPAIR_TIER.Tier2);
    }
  });

  it('is deterministic for a fixed keyword and motif', () => {
    const keyword = 'minimum';
    const motif = getMotifForKeyword(keyword);
    expect(motif).toBe('numericBounds');

    const tierFromKeyword = classifyTierForKeyword(keyword);
    const tierFromMotif = classifyTierForMotif(motif);

    expect(tierFromKeyword).toBe(REPAIR_TIER.Tier1);
    expect(tierFromKeyword).toBe(tierFromMotif);

    // Repeat to assert stability
    for (let i = 0; i < 5; i += 1) {
      expect(classifyTierForKeyword(keyword)).toBe(tierFromKeyword);
      expect(classifyTierForMotif(motif)).toBe(tierFromMotif);
    }
  });

  it('enforces default tier policy for structural keywords in G_valid', () => {
    expect(STRUCTURAL_KEYWORDS.has('required')).toBe(true);
    const decision = isActionAllowed({
      keyword: 'required',
      tier: REPAIR_TIER.Tier2,
      inGValid: true,
      allowStructuralInGValid: false,
      maxTier: REPAIR_TIER.Tier2,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowedMaxTier).toBe(REPAIR_TIER.Tier2);
    expect(decision.reason).toBe('g_valid');
  });

  it('allows Tier 1 non-structural repairs in G_valid and structural Tier 1 outside G_valid', () => {
    const numericInGValid = isActionAllowed({
      keyword: 'minimum',
      tier: REPAIR_TIER.Tier1,
      inGValid: true,
      allowStructuralInGValid: false,
      maxTier: REPAIR_TIER.Tier2,
    });
    expect(numericInGValid.allowed).toBe(true);

    const requiredOutsideGValid = isActionAllowed({
      keyword: 'required',
      tier: REPAIR_TIER.Tier2,
      inGValid: false,
      allowStructuralInGValid: false,
      maxTier: REPAIR_TIER.Tier2,
    });
    expect(requiredOutsideGValid.allowed).toBe(true);
  });
});
