
import { UserAnswers } from '../types';

export const encodeBattery = (testIds: string[]): string => {
  try {
    const json = JSON.stringify(testIds);
    return btoa(json);
  } catch (e) {
    console.error("Error encoding battery", e);
    return "";
  }
};

export const decodeBattery = (hash: string): string[] => {
  try {
    const json = atob(hash);
    return JSON.parse(json);
  } catch (e) {
    console.error("Error decoding battery", e);
    return [];
  }
};

export const encodeResults = (answers: UserAnswers, testIds: string[], aiInterpretation?: string): string => {
  try {
    // We strictly encode only necessary data: testIds, answers map, and optionally the AI text
    const payload = {
      t: testIds,
      a: answers,
      i: aiInterpretation // 'i' for interpretation (short key to save url length)
    };
    const json = JSON.stringify(payload);
    
    // Encode to base64 with unicode support
    return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch (e) {
    console.error("Error encoding results", e);
    return "";
  }
};

export const decodeResults = (hash: string): { testIds: string[], answers: UserAnswers, aiInterpretation?: string } | null => {
  try {
    const json = decodeURIComponent(atob(hash).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const payload = JSON.parse(json);
    if (payload.t && payload.a) {
        return { 
            testIds: payload.t, 
            answers: payload.a,
            aiInterpretation: payload.i // can be undefined
        };
    }
    return null;
  } catch (e) {
    console.error("Error decoding results", e);
    return null;
  }
};
