import type { Access } from './compare.ts';

export const STATUS_LABEL: Record<Access['status'], string> = {
  'visa-free': 'Visa-free',
  eta: 'eTA',
  voa: 'Visa on arrival',
  'e-visa': 'e-visa',
  required: 'Visa required',
  blocked: 'No admission',
  home: 'Home country',
  'no-data': 'No data',
};

const HAS_STAY: ReadonlySet<Access['status']> = new Set(['visa-free', 'eta', 'voa', 'e-visa']);

/** "Visa-free, 90 days", "e-visa, duration not listed", "Visa required". */
export function describeAccess(access: Access): string {
  const label = STATUS_LABEL[access.status];
  if (!HAS_STAY.has(access.status)) return label;
  if (access.days == null) return `${label}, duration not listed`;
  return `${label}, ${access.days} ${access.days === 1 ? 'day' : 'days'}`;
}
