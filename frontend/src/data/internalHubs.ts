// Warehouse sections at the same site that send parcels to each other.
// Rename here to change what users see. Old scans keep the name they were saved with.
export const INTERNAL_HUBS: string[] = [
  'ឃ្លាំង A (Hub A)',
  'ឃ្លាំង B (Hub B)',
];

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
const INTERNAL_HUB_KEYS = new Set(INTERNAL_HUBS.map(norm));

export function isInternalHub(value?: string): boolean {
  return !!value && INTERNAL_HUB_KEYS.has(norm(value));
}
