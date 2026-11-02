import data from './cancerTypes.json';

export interface CancerType { id: string; name: string; abbreviation: string; category: string; notes: string; }
interface RawItem { id: string; cancer_type: string; abbreviation: string; notes?: string; }
interface RawFile { categories: { category: string; items: RawItem[] }[]; }
const source = data as RawFile;
export const CANCER_TYPES: CancerType[] = source.categories.flatMap(category => category.items.map(item => ({ id: item.id, name: item.cancer_type, abbreviation: item.abbreviation, category: category.category, notes: item.notes ?? '' })));
export const OTHER_CANCER_TYPE_ID = 'CT0417';
export function cancerTypeLabel(type: CancerType) { return `${type.name} (${type.abbreviation})`; }
export function searchCancerTypes(query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return CANCER_TYPES;
  return CANCER_TYPES.map(type => ({ type, score: score(type, term) })).filter(result => result.score >= 0).sort((a, b) => a.score - b.score).map(result => result.type);
}
function score(type: CancerType, term: string) {
  const name = type.name.toLowerCase();
  const abbreviation = type.abbreviation.toLowerCase();
  if (abbreviation === term) return 0;
  if (name === term) return 1;
  if (abbreviation.startsWith(term)) return 2;
  if (name.startsWith(term)) return 3;
  if (name.includes(term)) return 4;
  if (abbreviation.includes(term)) return 5;
  if (type.category.toLowerCase().includes(term)) return 6;
  if (type.notes.toLowerCase().includes(term)) return 7;
  return -1;
}