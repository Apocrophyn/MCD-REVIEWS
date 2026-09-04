export interface SurveyPreparation {
  provider: string;
  url: string;
  participationCode: string;
  instructions: string;
  expiresGuidance: string;
}

export interface SurveyProvider {
  prepare(input: { surveyCode: string; visitedAt: string | null }): SurveyPreparation;
}

export class McDonaldsFoodForThoughtProvider implements SurveyProvider {
  prepare(input: { surveyCode: string; visitedAt: string | null }): SurveyPreparation {
    if (!input.surveyCode.trim()) throw new Error("A participation code is required");
    return {
      provider: "McDonald’s Food for Thoughts",
      url: "https://www.mcdfoodforthoughts.com/",
      participationCode: input.surveyCode,
      instructions: "Approve the confirmed answers once. Receipt Relay can then complete the official survey in its private background browser and report the result in the app.",
      expiresGuidance: "Current UK terms require survey completion within 60 days of receiving an eligible receipt. Check the official terms before continuing.",
    };
  }
}
