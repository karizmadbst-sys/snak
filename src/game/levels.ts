import type { LevelDef } from './types.ts';
import { generateAllLevels, SECTOR_WINGS, type SectorWing } from './levelGenerator.ts';

export { SECTOR_WINGS, type SectorWing };

export const LEVELS: LevelDef[] = generateAllLevels();
