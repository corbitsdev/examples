export type OptionId = "a" | "b" | "c";

export type GrillOption = {
  id: OptionId;
  title: string;
  detail: string;
};

export type GrillQuestion = {
  needsQuestion: true;
  round: number;
  question: string;
  context: string;
  options: [GrillOption, GrillOption, GrillOption];
  recommendedOptionId: OptionId;
};

export type GrillComplete = {
  needsQuestion: false;
};

export type GrillTurn = GrillQuestion | GrillComplete;

export type GrillDecision = {
  round: number;
  question: string;
  selectedOptionId: OptionId;
  selectedOptionTitle: string;
  finalizedBy: string;
};

export type GrillSignalPayload = {
  decisions: GrillDecision[];
};

export type GrillReport = {
  conclusion: string;
  openItems: string[];
};
