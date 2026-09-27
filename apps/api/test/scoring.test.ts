import { describe, expect, it } from 'vitest';
import { DIMENSIONS, type DimensionId } from '@thisai/ta-shared';
import { loadBank } from '../src/bank';
import {
  bandFor, buildProfile, coachingNote, cohortAverages, equityGate, growthOf, indexFor, insightsFor, itemsForBand,
  pathFor, scoreItem, seededRandom, shuffledOptions, strengthsOf, validityFor, type DimScore, type ScoringItem,
} from '../src/scoring/v1';

const item: ScoringItem = {
  item_id: 'T-01', grade_band: 'Middle (6-8)', dimension: 'Equity of Treatment',
  scenario: 'During group work, Kiran keeps interrupting while the quieter students wait.',
  options: [
    { label: 'W', text: 'Best response', key_rank: 1, rationale: 'Same process for everyone.' },
    { label: 'X', text: 'Second response', key_rank: 2, rationale: 'Close.' },
    { label: 'Y', text: 'Third response', key_rank: 3, rationale: 'Weaker.' },
    { label: 'Z', text: 'Worst response', key_rank: 4, rationale: 'Harmful.' },
  ],
};
const byKey = (order: string) => [...order].map((k) => item.options.find((o) => o.key_rank === +k)!.label);

describe('scoreItem — placed order vs key', () => {
  it.each([
    ['1234', 3.0], ['2134', 2.25], ['1243', 2.25], ['1324', 2.25], ['2143', 1.5], ['4231', 0.75], ['4321', 0.0],
  ])('%s → %d', (order, expected) => {
    expect(scoreItem(item, byKey(order))).toBe(expected);
  });
  it('returns null with fewer than 4 placed', () => {
    expect(scoreItem(item, ['W', 'X', null, 'Z'])).toBeNull();
    expect(scoreItem(item, [])).toBeNull();
    expect(scoreItem(item, undefined)).toBeNull();
  });
});

describe('bands', () => {
  it('thresholds 2.3 / 1.3', () => {
    expect(bandFor(3)).toBe('strong');
    expect(bandFor(2.3)).toBe('strong');
    expect(bandFor(2.29)).toBe('consistent');
    expect(bandFor(1.3)).toBe('consistent');
    expect(bandFor(1.2)).toBe('developing');
    expect(bandFor(0)).toBe('developing');
  });
});

function dimsFrom(scores: (number | null)[]): DimScore[] {
  return DIMENSIONS.map((d, i) => ({
    dimension_id: d.id, dimension_name: d.name, score_0_to_3: scores[i],
    band: scores[i] === null ? null : bandFor(scores[i] as number),
    items_scored: scores[i] === null ? 0 : 5, coaching_note: null, action: d.action,
  }));
}

describe('index, strengths, growth, insights', () => {
  // order: equity, deesc, doubt, adapt, decide, critical, lead
  const dims = dimsFrom([2.8, 2.4, 2.0, 1.9, 1.6, 1.2, 2.5]);

  it('mean 2.057 → index 69 → Consistent practice', () => {
    const idx = indexFor(dims)!;
    expect(idx.mean).toBeCloseTo(2.06, 2);
    expect(idx.value).toBe(69);
    expect(idx.label).toBe('Consistent practice');
  });
  it('strengths = 2.8, 2.5; growth = 1.2 then 1.6', () => {
    expect(strengthsOf(dims).map((d) => d.score_0_to_3)).toEqual([2.8, 2.5]);
    expect(growthOf(dims).map((d) => d.score_0_to_3)).toEqual([1.2, 1.6]);
  });
  it('spread 1.6 → uneven insight', () => {
    const ins = insightsFor(dims, 'Middle (6-8)', 'teacher');
    expect(ins.map((i) => i.ic)).toEqual(['▲', '▼', '≈', '✓']);
    expect(ins[2].text).toMatch(/uneven/);
    expect(ins[0].text).toMatch(/^Your sharpest instinct is Equity of Treatment \(2\.80/);
    expect(insightsFor(dims, 'Middle (6-8)', 'admin')[0].text).toMatch(/^This teacher's sharpest/);
  });
  it('even profile → raise the ceiling', () => {
    const even = dimsFrom([2.0, 2.1, 2.2, 1.9, 1.8, 2.0, 2.1]);
    expect(insightsFor(even, 'Middle (6-8)', 'teacher')[2].text).toMatch(/raising the ceiling/);
  });
  it('index thresholds agree with bands (77 / 43)', () => {
    expect(indexFor(dimsFrom([2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3]))!.label).toBe('Strong practice');
    expect(indexFor(dimsFrom([1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3]))!.label).toBe('Consistent practice');
    expect(indexFor(dimsFrom([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2]))!.label).toBe('Developing practice');
    expect(indexFor(dimsFrom([null, null, null, null, null, null, null]))).toBeNull();
  });
  it('strengths and growth stay disjoint with few dims scored', () => {
    const three = dimsFrom([2.0, null, null, 1.0, 2.5, null, null]);
    expect(strengthsOf(three).map((d) => d.dimension_id)).toEqual(['decide']);
    expect(growthOf(three).map((d) => d.dimension_id)).toEqual(['adapt']);
    const one = dimsFrom([2.0, null, null, null, null, null, null]);
    expect(strengthsOf(one)).toEqual([]);
    expect(growthOf(one)).toEqual([]);
    expect(insightsFor(one, 'Pre-school', 'teacher')[0].ic).toBe('◔');
    expect(pathFor(one, 'teacher')).toEqual([]);
  });
});

describe('equity gate', () => {
  it('equity mean 1.2 → gate raised regardless of the index', () => {
    const dims = dimsFrom([1.2, 3, 3, 3, 3, 3, 3]);
    expect(indexFor(dims)!.label).toBe('Strong practice');
    expect(equityGate(dims)).toBe(true);
    const ins = insightsFor(dims, 'Middle (6-8)', 'teacher');
    expect(ins.find((i) => i.ic === '!')).toBeTruthy();
  });
  it('not raised when equity is unscored or consistent', () => {
    expect(equityGate(dimsFrom([null, 1, 1, 1, 1, 1, 1]))).toBe(false);
    expect(equityGate(dimsFrom([1.3, 1, 1, 1, 1, 1, 1]))).toBe(false);
  });
});

describe('six-week path', () => {
  it('A, peer observation on A, B, retake, mentor in S', () => {
    const dims = dimsFrom([2.8, 2.4, 2.0, 1.9, 1.6, 1.2, 2.5]);
    const p = pathFor(dims, 'teacher');
    expect(p.map((s) => s.wk)).toEqual(['Weeks 1–2', 'Week 3', 'Weeks 4–5', 'Week 6', 'Ongoing']);
    expect(p[0].t).toBe('Evidence Before Action — Critical Thinking / Root-Cause Diagnosis');
    expect(p[1].d).toMatch(/critical thinking \/ root-cause diagnosis/);
    expect(p[1].d).toMatch(/not used for appraisal/);
    expect(p[2].t).toBe('Deciding With Incomplete Facts — Decision-Making Under Ambiguity');
    expect(p[3].d).toMatch(/per dimension, not the index/);
    expect(p[4].t).toBe('Use your strength in Equity of Treatment');
    expect(pathFor(dims, 'admin')[4].t).toBe('Deploy their strength in Equity of Treatment');
  });
});

describe('coaching notes', () => {
  const e = (order: string, score: number) => ({ item, ranked: byKey(order), score });
  it('a) best and worst correct', () => {
    expect(coachingNote([e('1324', 2.25)], 'teacher')).toMatch(/strongest and weakest responses were placed where the framework places them/);
  });
  it('b) best correct only', () => {
    const n = coachingNote([e('1342', 1.5)], 'teacher');
    expect(n).toMatch(/"Second response" was placed below "Worst response"/);
    expect(n).toMatch(/reading of what does most harm is less sharp/);
  });
  it('c) otherwise quotes the scenario and the keyed best', () => {
    expect(coachingNote([e('2134', 2.25)], 'teacher'))
      .toBe('In the group work scenario, you ranked "Second response" first. The framework places "Best response" first — same process for everyone.');
    expect(coachingNote([e('2134', 2.25)], 'admin')).toMatch(/this teacher ranked/);
  });
  it('uses the lowest-scoring item', () => {
    expect(coachingNote([e('1234', 3), e('4321', 0)], 'teacher')).toMatch(/you ranked "Worst response" first/);
  });
});

describe('test assembly', () => {
  const bank = loadBank();
  it('bank has 35 items per band, 5 per dimension', () => {
    expect(bank.length).toBeGreaterThanOrEqual(84);
    for (const band of ['Pre-school', 'Middle (6-8)', 'College/UG']) expect(itemsForBand(bank, band)).toHaveLength(35);
  });
  it('round-robin: no two consecutive items share a dimension, dims cycle in order', () => {
    const items = itemsForBand(bank, 'Middle (6-8)');
    for (let i = 1; i < items.length; i++) expect(items[i].dimension).not.toBe(items[i - 1].dimension);
    expect(items.slice(0, 7).map((i) => i.dimension)).toEqual(DIMENSIONS.map((d) => d.name));
  });
  it('round-robin handles uneven cells', () => {
    const tiny = [
      { grade_band: 'X', dimension: DIMENSIONS[0].name, id: 1 }, { grade_band: 'X', dimension: DIMENSIONS[0].name, id: 2 },
      { grade_band: 'X', dimension: DIMENSIONS[1].name, id: 3 }, { grade_band: 'Y', dimension: DIMENSIONS[1].name, id: 4 },
    ];
    expect(itemsForBand(tiny, 'X').map((i) => i.id)).toEqual([1, 3, 2]);
  });
});

describe('option shuffle', () => {
  const bank = loadBank();
  it('is stable across calls', () => {
    for (const i of bank.slice(0, 20)) {
      expect(shuffledOptions(i).map((o) => o.label)).toEqual(shuffledOptions(i).map((o) => o.label));
    }
  });
  it('matches the prototype (FNV-1a → mulberry32 → Fisher–Yates + guard)', () => {
    // Reference orders produced by the prototype's teacher-sjt.js shuffledOptions().
    const ref: Record<string, string> = {
      'PS-EQ-01': 'DCBA', 'MID-DE-01': 'DABC', 'HSEC-DR-01': 'BACD',
      'PR-CT-03': 'CABD', 'HS-DE-03': 'DCAB', 'HSEC-DM-03': 'CABD',
    };
    for (const [id, order] of Object.entries(ref)) {
      const it = bank.find((i) => i.item_id === id)!;
      expect(shuffledOptions(it).map((o) => o.label).join('')).toBe(order);
    }
  });
  it('never shows key 1 first AND key 4 last', () => {
    for (const i of bank) {
      const o = shuffledOptions(i);
      expect(o[0].key_rank === 1 && o[3].key_rank === 4).toBe(false);
    }
  });
  it('salt changes the order for at least some items', () => {
    const differ = bank.filter((i) => shuffledOptions(i).map((o) => o.label).join() !== shuffledOptions(i, 'pepper').map((o) => o.label).join());
    expect(differ.length).toBeGreaterThan(bank.length / 2);
  });
});

describe('validity flag', () => {
  const bank = loadBank();
  const items = itemsForBand(bank, 'Middle (6-8)');
  const perfect = Object.fromEntries(items.map((i) => [i.item_id, { ranked: ['A', 'B', 'C', 'D'], ms_on_item: 30000 }]));
  it('≥ 30 of 35 in exact key order', () => {
    const v = validityFor(items, perfect);
    expect(v.flag).toBe(true);
    expect(v.exact_key_items).toBe(35);
    expect(v.reasons.join(' ')).toMatch(/exact keyed order/);
  });
  it('median time under 8s', () => {
    const rng = seededRandom('v');
    const answers = Object.fromEntries(items.map((i) => {
      const o = ['A', 'B', 'C', 'D'].sort(() => rng() - 0.5);
      return [i.item_id, { ranked: o, ms_on_item: 5000 }];
    }));
    expect(validityFor(items, answers).reasons.some((r) => /Median time/.test(r))).toBe(true);
  });
  it('same display position at the same rank on ≥ 80% of items', () => {
    const disp = (i: ScoringItem) => shuffledOptions(i).map((o) => o.label);
    const answers = Object.fromEntries(items.map((i) => [i.item_id, { ranked: disp(i), ms_on_item: 30000 }]));
    expect(validityFor(items, answers).reasons.some((r) => /Option A \(as shown\) was placed at rank 1/.test(r))).toBe(true);
  });
  it('a varied, unhurried profile is not flagged', () => {
    const rng = seededRandom('ok');
    const answers = Object.fromEntries(items.map((i) => {
      const keyed = ['A', 'B', 'C', 'D'];
      const k = Math.floor(rng() * 3);
      [keyed[k], keyed[k + 1]] = [keyed[k + 1], keyed[k]];
      if (rng() > 0.5) [keyed[0], keyed[3]] = [keyed[3], keyed[0]];
      return [i.item_id, { ranked: keyed, ms_on_item: 20000 + Math.floor(rng() * 20000) }];
    }));
    const v = validityFor(items, answers);
    expect(v.reasons).toEqual([]);
  });
});

describe('buildProfile + cohort', () => {
  const bank = loadBank();
  const items = itemsForBand(bank, 'Primary (1-5)');
  it('builds a full profile with version and both copy variants', () => {
    const answers = Object.fromEntries(items.map((i, n) => [i.item_id, { ranked: n % 2 ? ['B', 'A', 'C', 'D'] : ['A', 'B', 'D', 'C'], ms_on_item: 20000 }]));
    const p = buildProfile(items, answers, 'Primary (1-5)');
    expect(p.scoring_version).toBe('v1');
    expect(p.index).toBe(75);
    expect(p.dims.every((d) => d.items_scored === 5)).toBe(true);
    expect(p.insights.teacher[0].text).toMatch(/^Your/);
    expect(p.insights.admin[0].text).toMatch(/^This teacher's/);
    expect(p.items_answered).toBe(35);
  });
  it('cohort only when N ≥ 5', () => {
    const prof = (v: number) => ({ dims: DIMENSIONS.map((d) => ({ dimension_id: d.id as DimensionId, score_0_to_3: v })) });
    expect(cohortAverages([prof(1), prof(2), prof(3), prof(2)]).available).toBe(false);
    const c = cohortAverages([prof(1), prof(2), prof(3), prof(2), prof(2)]);
    expect(c.available).toBe(true);
    expect(c.dims!.equity).toBe(2);
  });
});
