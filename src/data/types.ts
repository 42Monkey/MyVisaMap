export type Status = 'visa-free' | 'eta' | 'voa' | 'e-visa' | 'required' | 'blocked';

export interface Entry {
  status: Status;
  /** Allowed stay in days. Missing means "duration not listed", NOT unlimited. */
  days?: number;
}

export interface VisaMeta {
  source: string;
  license: string;
  /** Date of the last commit of the source repo when the data was generated. */
  snapshot: string;
}

/** Shape of the generated src/data/visa.json (entries are compact-encoded, see codec.ts). */
export interface VisaFile {
  meta: VisaMeta;
  /** ISO-2 -> display name, for every code in `codes`. */
  names: Record<string, string>;
  /** Every ISO-2 code in the dataset (same set as passports and destinations), sorted. */
  codes: string[];
  /** data[passport][destination] = encoded entry. A passport has no entry for itself. */
  data: Record<string, Record<string, string>>;
}
