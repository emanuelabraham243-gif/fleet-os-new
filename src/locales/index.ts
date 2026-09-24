import type { Dict, Locale } from '../lib/i18n-core';
import { en as core_en, } from './en';
import { am as core_am } from './am';
import { en as home_en, am as home_am } from './features/home';
import { en as trips_en, am as trips_am } from './features/trips';
import { en as maint_en, am as maint_am } from './features/maintenance';
import { en as drivers_en, am as drivers_am } from './features/drivers';
import { en as reports_en, am as reports_am } from './features/reports';

export const enMerged = { ...core_en, ...home_en, ...trips_en, ...maint_en, ...drivers_en, ...reports_en };
const amMerged = { ...core_am, ...home_am, ...trips_am, ...maint_am, ...drivers_am, ...reports_am };

export const dictionaries: Record<Locale, Dict> = {
  en: enMerged as Dict,
  am: amMerged as Dict,
};

export type { Dict };
