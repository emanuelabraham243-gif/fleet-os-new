import type { Widen } from '../../lib/i18n-core';

// Camera capture + auto-cleanup, and the per-document download options. en is the source of truth.
export const en = {
  capture: {
    button: 'Capture document',
    intro: 'Take a photo of the paper. FleetOS straightens it, crops it and makes the text clearer automatically.',
    takePhoto: 'Take photo',
    retake: 'Take again',
    preparing: 'Preparing the scanner… The first time can take a moment.',
    processing: 'Cleaning up the photo…',
    detected: 'Edges found: the page was straightened, cropped and cleaned up.',
    notDetected: 'The page edges were not found, so the whole photo was cleaned up. You can take it again.',
    failed: 'The photo could not be processed. Please try again.',
    cleanedLabel: 'Cleaned-up version (this is what is saved and shown)',
    originalLabel: 'Original photo (also kept)',
    name: 'Name',
    nameHint: 'A short name, e.g. "Insurance 2026" or "Fuel receipt".',
    noPhoto: 'Take a photo first.',
    save: 'Save captured document',
  },
  docFile: {
    saveImage: 'Save as image',
    savePdf: 'Save as PDF',
    download: 'Download file',
    viewOriginal: 'View original photo',
    working: 'Preparing…',
    failed: 'The download failed. Please try again.',
  },
};

export const am: Widen<typeof en> = {
  capture: {
    button: 'ሰነድ በካሜራ አንሳ',
    intro: 'የወረቀቱን ፎቶ ያንሱ። FleetOS በራሱ ያቃናዋል፣ ይቆርጠዋል፣ ጽሑፉንም ያጠራዋል።',
    takePhoto: 'ፎቶ አንሳ',
    retake: 'እንደገና አንሳ',
    preparing: 'ስካነሩ እየተዘጋጀ ነው… የመጀመሪያው ጊዜ ትንሽ ሊቆይ ይችላል።',
    processing: 'ፎቶው እየጠራ ነው…',
    detected: 'ጠርዞቹ ተገኝተዋል፦ ገጹ ተቃንቶ፣ ተቆርጦና ጠርቶ ተዘጋጅቷል።',
    notDetected: 'የገጹ ጠርዞች አልተገኙም፣ ስለዚህ ሙሉው ፎቶ ጠርቷል። እንደገና ማንሳት ይችላሉ።',
    failed: 'ፎቶውን ማስተካከል አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
    cleanedLabel: 'የጠራው ቅጂ (የሚቀመጠውና የሚታየው ይህ ነው)',
    originalLabel: 'ዋናው ፎቶ (እሱም ይቀመጣል)',
    name: 'ስም',
    nameHint: 'አጭር ስም፣ ለምሳሌ "ኢንሹራንስ 2026" ወይም "የነዳጅ ደረሰኝ"።',
    noPhoto: 'መጀመሪያ ፎቶ ያንሱ።',
    save: 'የተነሳውን ሰነድ አስቀምጥ',
  },
  docFile: {
    saveImage: 'እንደ ምስል አስቀምጥ',
    savePdf: 'እንደ PDF አስቀምጥ',
    download: 'ፋይሉን አውርድ',
    viewOriginal: 'ዋናውን ፎቶ ክፈት',
    working: 'እየተዘጋጀ ነው…',
    failed: 'ማውረድ አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
  },
};
