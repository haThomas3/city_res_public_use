/**
 * Content schema for content/city.json.
 * Everything in that file is bundled into the public site, so never put
 * secrets, client names or personal data in it.
 */

export type Lang = 'en' | 'he';

/** Plain English text, or English with an optional Hebrew translation. */
export type LocalizedText = string | { en: string; he?: string };
export type LocalizedList = string[] | { en: string[]; he?: string[] };

/** featured = main projects, more = solid side projects, optional = coursework and small tools. */
export type Tier = 'featured' | 'more' | 'optional';

/** private = code is not public: no repo link, shown as a showcase with a "Private / client work" badge. */
export type Access = 'public' | 'private';

export interface OwnerLink {
  label: LocalizedText;
  url: string;
}

export interface Owner {
  name: string;
  initials: string;
  role: LocalizedText;
  bio: LocalizedText;
  links: OwnerLink[];
}

export interface District {
  id: string;
  name: LocalizedText;
  /** Neon accent colour for the district, as #rrggbb. */
  color: string;
  /** One sentence on what the district's projects have in common. Shown when hovering the district. */
  blurb?: LocalizedText;
}

/** One floor of the building = one module or part of the project. Listed bottom to top. */
export interface Floor {
  name: LocalizedText;
  detail?: LocalizedText;
}

export interface Metric {
  value: string;
  label: LocalizedText;
}

/** Facts used to size the building. All optional. */
export interface ProjectSize {
  linesOfCode?: number;
  tests?: number;
  months?: number;
  /** Drives the footprint (base area) of the building. */
  teamSize?: number;
}

/** Manual placement override. Without it the layout algorithm places the building. */
export interface Placement {
  /** Absolute angle around the plaza, in degrees (0 = +x axis). Defaults to the district centre. */
  angle?: number;
  /** Distance from the plaza centre, in world units (at least 9). */
  radius?: number;
}

export interface GalleryItem {
  /** Path under public/, e.g. "assets/projects/threat-map/board.png", or an https URL. */
  src: string;
  caption?: LocalizedText;
}

export interface ProjectLinks {
  github?: string;
  demo?: string;
  video?: string;
}

export interface Project {
  id: string;
  district: string;
  tier: Tier;
  access: Access;
  /** construction = not finished yet: the building is drawn with scaffolding and a crane, with an "under construction" badge. */
  status?: 'construction';
  title: LocalizedText;
  /** One sentence shown on the card and in tooltips. */
  tagline: LocalizedText;
  /** Long description, revealed with the "Full description" button. */
  description?: LocalizedText;
  goals?: LocalizedList;
  /** For team projects: what I built personally. */
  myRole?: LocalizedText;
  stack: string[];
  metrics?: Metric[];
  links?: ProjectLinks;
  gallery?: GalleryItem[];
  floors?: Floor[];
  size?: ProjectSize;
  /** Force a number of floors (1-12) instead of the computed height. */
  heightOverride?: number;
  place?: Placement;
  /** When the project started, "YYYY-MM" (first commit, or first work if earlier). Shown on a plaque by the building. */
  founded?: string;
  /** Where the founded date comes from, when it is not simply the first commit (shown when the plaque is clicked). */
  foundedNote?: LocalizedText;
  /** Short text for the neon sign on the building (max 14 chars). */
  sign?: string;
  /** Internal note, not displayed (but still public in the bundle). */
  notes?: string;
}

/** Site-wide settings. */
export interface SiteSettings {
  /** Microsoft Clarity project ID. Empty = no analytics and no consent bar. */
  clarityId?: string;
}

/**
 * How close two projects are, drawn between their buildings:
 * 1 = related (a paved path), 2 = share code or data (a shared park), 3 = two parts of one piece of work (a skybridge).
 */
export type LinkLevel = 1 | 2 | 3;

export interface Connection {
  a: string;
  b: string;
  level: LinkLevel;
  /** One short sentence on what links them. Shown on the card. */
  why: LocalizedText;
}

export interface CityData {
  site?: SiteSettings;
  owner: Owner;
  districts: District[];
  projects: Project[];
  /** Links between related projects. Levels 2 and 3 need both projects in the same district (they stand side by side). */
  connections?: Connection[];
}
