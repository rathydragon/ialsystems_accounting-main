import { describe, it, expect } from 'vitest';
import { classifyRows, rowHash, rowKey } from '../../api/backup-restore.js';

// columns: [id, name, removed_at]
const pkIdx = [0];
const tombstoneIdx = [0];

function live(rows) {
  return new Map(rows.map((r) => [rowKey(r, pkIdx), rowHash(r)]));
}

describe('classifyRows (insert-only restore)', () => {
  it('only rows missing from Hostinger are restorable', () => {
    const backupRows = [['1', 'A', null], ['2', 'B', null], ['3', 'C', null]];
    const r = classifyRows({ backupRows, liveHashes: live([['1', 'A', null]]), pkIdx, tombstones: new Set(), tombstoneIdx });
    expect(r.missing.map((m) => m.key)).toEqual(['2', '3']);
    expect(r.same).toBe(1);
    expect(r.different).toEqual([]);
  });

  it('rows that changed in Hostinger are reported as different, never restored', () => {
    const backupRows = [['1', 'Old name', null]];
    const r = classifyRows({ backupRows, liveHashes: live([['1', 'New name', null]]), pkIdx, tombstones: new Set(), tombstoneIdx });
    expect(r.missing).toEqual([]);
    expect(r.different.map((d) => d.key)).toEqual(['1']);
  });

  it('tombstoned (deleted on purpose) rows are skipped', () => {
    const backupRows = [['1', 'A', null], ['2', 'B', null]];
    const r = classifyRows({ backupRows, liveHashes: new Map(), pkIdx, tombstones: new Set(['2']), tombstoneIdx });
    expect(r.missing.map((m) => m.key)).toEqual(['1']);
    expect(r.tombstoned.map((t) => t.key)).toEqual(['2']);
  });

  it('NULL and empty string are treated as different values', () => {
    expect(rowHash(['1', null])).not.toBe(rowHash(['1', '']));
  });

  it('composite keys are joined', () => {
    expect(rowKey(['a', 'b', 'x'], [0, 1])).toBe('a\u0001b');
  });
});
