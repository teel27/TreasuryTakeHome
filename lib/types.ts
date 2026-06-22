export interface LabelField {
  value: string | null;
  legible: boolean;
}

export interface ExtractedLabel {
  brandName: LabelField;
  classType: LabelField;
  alcoholContent: LabelField;
  netContents: LabelField;
  governmentWarning: LabelField;
}

export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
}

export type FieldStatus = 'PASS' | 'REVIEW' | 'FAIL';

export interface FieldResult {
  field: string;
  status: FieldStatus;
  reason: string;
  labelValue: string | null;
  applicationValue: string;
}
