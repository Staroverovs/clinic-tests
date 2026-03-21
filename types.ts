
export type Category = 'depression' | 'anxiety' | 'personality' | 'personality_disorder' | 'emotion_regulation' | 'ocd' | 'bipolar' | 'eating_disorders' | 'adhd' | 'narcissism' | 'alexithymia' | 'general_distress' | 'ptsd' | 'self_knowledge' | 'wellbeing' | 'burnout';

export type DiagnosticDepth = 'express' | 'standard' | 'deep';

export type Severity = 'normal' | 'mild' | 'moderate' | 'severe' | 'critical';

export interface TestQuestion {
  id: number;
  text: string;
  options: {
    text: string;
    score: number;
  }[];
}

export interface SubscaleResult {
  name: string;
  score: number;
  maxScore: number;
  severity?: string;
}

export interface TestDefinition {
  id: string;
  name: string;
  fullName: string;
  author: string;
  category: Category;
  description: string;
  instructions: string;
  questions: TestQuestion[];
  externalUrl?: string; // New optional property for external links
  // Interpretation now receives the full map of answers to calculate subscales if needed
  interpretation: (answers: Record<number, number>) => {
    label: string;
    description: string;
    severity: Severity;
    details?: string;
    subscales?: SubscaleResult[];
  };
}

export interface UserAnswers {
  [testId: string]: {
    [questionId: number]: number;
  };
}

export interface TestResult {
  testId: string;
  testName: string;
  score: number;
  interpretation: string;
  severity: Severity;
  details?: string;
  subscales?: SubscaleResult[];
}

export interface Disease {
  id: string;
  name: string;
  description: string;
  symptoms: string[];
  recommendations: string;
}
