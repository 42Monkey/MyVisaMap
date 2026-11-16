import { describe, expect, it } from 'vitest';
import { bestOf, type Access } from './compare.ts';
import { recommend } from './recommend.ts';

const free: Access = { status: 'visa-free', days: 90 };
const evisa: Access = { status: 'e-visa' };
const required: Access = { status: 'required' };
const home: Access = { status: 'home' };

function run(names: string[], accesses: Access[]) {
  return recommend(names, accesses, bestOf(accesses));
}

describe('recommend', () => {
  it('names the passport to use', () => {
    expect(run(['Thailand', 'Germany'], [evisa, free])?.headline).toBe('Use Germany');
    expect(run(['Thailand', 'Germany'], [free, evisa])?.headline).toBe('Use Thailand');
  });

  it('picks one of several', () => {
    expect(run(['Thailand', 'Germany', 'Japan'], [evisa, required, free])?.headline).toBe('Use Japan');
  });

  it('lists the passports that tie for best', () => {
    expect(run(['Thailand', 'Germany', 'Japan'], [free, evisa, free])?.headline).toBe('Thailand or Japan');
    expect(run(['A', 'B', 'C', 'D'], [free, free, free, evisa])?.headline).toBe('A, B or C');
  });

  it('says either or any works when entry is workable and equal', () => {
    expect(run(['Thailand', 'Germany'], [free, free])?.headline).toBe('Either works');
    expect(run(['A', 'B', 'C'], [free, free, free])?.headline).toBe('Any works');
  });

  it('does not promise anything when all need a visa', () => {
    expect(run(['Thailand', 'Germany'], [required, required])?.headline).toBe('Same for both');
    expect(run(['A', 'B', 'C'], [required, required, required])?.headline).toBe('Same for all');
  });

  it('explains a home country', () => {
    const r = run(['Thailand', 'Germany'], [home, free]);
    expect(r?.headline).toBe('Use Thailand');
    expect(r?.note).toContain('Thailand');
  });

  it('explains when only the stay length differs', () => {
    const r = run(['Thailand', 'Germany'], [{ status: 'visa-free', days: 30 }, free]);
    expect(r?.note).toBe('Same entry, longer stay');
  });

  it('has nothing to recommend with one passport', () => {
    expect(run(['Thailand'], [free])).toBeNull();
  });
});
