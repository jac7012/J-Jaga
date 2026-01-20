
export enum AppMode {
  STANDBY = 'STANDBY',
  MECHANIC = 'MECHANIC',
  SCEPTIC = 'SCEPTIC',
  GUARDIAN = 'GUARDIAN'
}

export interface DiagnosticResult {
  issue: string;
  confidence: number;
  fraudRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

export interface ScepticFlag {
  timestamp: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ScepticResult {
  lemonScore: number;
  flags: ScepticFlag[];
  summary: string;
}

export interface GuardianAction {
  instruction: string;
  status: 'scanning' | 'captured' | 'waiting';
}
