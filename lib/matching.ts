import { distance } from 'fastest-levenshtein';
import { normalizeText, parseABV, parseNetContents } from './normalize';
import type { ExtractedLabel, ApplicationData, FieldResult } from './types';

const GOVERNMENT_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - distance(a, b)) / maxLen;
}

function matchTextWithSimilarity(
  labelValue: string | null,
  appValue: string,
  fieldName: string,
): FieldResult {
  if (!labelValue) {
    return {
      field: fieldName,
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const normLabel = normalizeText(labelValue);
  const normApp = normalizeText(appValue);

  if (normLabel === normApp) {
    return {
      field: fieldName,
      status: 'PASS',
      reason: 'Matches after normalizing case/punctuation.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const ratio = similarityRatio(normLabel, normApp);

  if (ratio >= 0.85) {
    return {
      field: fieldName,
      status: 'REVIEW',
      reason: `Label reads "${labelValue}", application reads "${appValue}" — possible typo or distinct product, needs human review.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: fieldName,
    status: 'FAIL',
    reason: `${fieldName} does not match application.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchAlcoholContent(labelValue: string | null, appValue: string): FieldResult {
  if (!labelValue) {
    return {
      field: 'Alcohol Content',
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const labelABV = parseABV(labelValue);
  const appABV = parseABV(appValue);

  if (labelABV === null || appABV === null) {
    return {
      field: 'Alcohol Content',
      status: 'REVIEW',
      reason: 'Could not parse alcohol content value for comparison.',
      labelValue,
      applicationValue: appValue,
    };
  }

  if (Math.abs(labelABV - appABV) <= 0.1) {
    return {
      field: 'Alcohol Content',
      status: 'PASS',
      reason: `Both values confirm ${labelABV.toFixed(1)}% ABV.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: 'Alcohol Content',
    status: 'FAIL',
    reason: `Label shows ${labelABV.toFixed(1)}% ABV, application shows ${appABV.toFixed(1)}% ABV.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchNetContents(labelValue: string | null, appValue: string): FieldResult {
  if (!labelValue) {
    return {
      field: 'Net Contents',
      status: 'REVIEW',
      reason: 'Could not verify — value not legible on label.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const labelParsed = parseNetContents(labelValue);
  const appParsed = parseNetContents(appValue);

  if (!labelParsed || !appParsed) {
    return {
      field: 'Net Contents',
      status: 'REVIEW',
      reason: 'Could not parse net contents value for comparison.',
      labelValue,
      applicationValue: appValue,
    };
  }

  const isSameUnit = labelParsed.originalUnit === appParsed.originalUnit;
  const tolerance = isSameUnit ? 0 : 0.05;

  if (Math.abs(labelParsed.valueMl - appParsed.valueMl) <= tolerance) {
    return {
      field: 'Net Contents',
      status: 'PASS',
      reason: `Both values confirm ${Math.round(labelParsed.valueMl)} mL.`,
      labelValue,
      applicationValue: appValue,
    };
  }

  return {
    field: 'Net Contents',
    status: 'FAIL',
    reason: `Label shows ${labelParsed.valueMl.toFixed(1)} mL, application shows ${appParsed.valueMl.toFixed(1)} mL.`,
    labelValue,
    applicationValue: appValue,
  };
}

function matchGovernmentWarning(labelValue: string | null): FieldResult {
  if (!labelValue) {
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason: 'Government Warning Statement not found on label.',
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  if (!labelValue.includes('GOVERNMENT WARNING:')) {
    const titleCaseFound = labelValue.match(/government warning/i);
    const reason = titleCaseFound
      ? `"${titleCaseFound[0]}" found — must appear as "GOVERNMENT WARNING:" in all caps.`
      : 'Government Warning Statement not found or incorrectly formatted on label.';
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason,
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  const normalizedLabel = labelValue.replace(/\s+/g, ' ').trim();
  const normalizedCanonical = GOVERNMENT_WARNING.replace(/\s+/g, ' ').trim();

  if (normalizedLabel !== normalizedCanonical) {
    return {
      field: 'Government Warning',
      status: 'FAIL',
      reason: 'Government Warning Statement text does not match the required wording exactly.',
      labelValue,
      applicationValue: GOVERNMENT_WARNING,
    };
  }

  return {
    field: 'Government Warning',
    status: 'PASS',
    reason:
      'Warning text and capitalization verified exactly. Bold formatting cannot be assessed from image analysis — confirm visually.',
    labelValue,
    applicationValue: GOVERNMENT_WARNING,
  };
}

export function verifyLabel(extracted: ExtractedLabel, application: ApplicationData): FieldResult[] {
  return [
    matchTextWithSimilarity(
      extracted.brandName.legible ? extracted.brandName.value : null,
      application.brandName,
      'Brand Name',
    ),
    matchTextWithSimilarity(
      extracted.classType.legible ? extracted.classType.value : null,
      application.classType,
      'Class/Type',
    ),
    matchAlcoholContent(
      extracted.alcoholContent.legible ? extracted.alcoholContent.value : null,
      application.alcoholContent,
    ),
    matchNetContents(
      extracted.netContents.legible ? extracted.netContents.value : null,
      application.netContents,
    ),
    matchGovernmentWarning(
      extracted.governmentWarning.legible ? extracted.governmentWarning.value : null,
    ),
  ];
}
