
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ParsedAnalysis, ScreenAnalysis, Language, SelectionRect, Screenshot, ProjectContext } from "../types";

const generateSystemInstruction = (
  language: Language, 
  context: ProjectContext
) => `
You are UI2GA, a world-class GA4 Tagging Architect specialized in
Korean-first enterprise analytics standards.

Selected Language for OUTPUT: ${language === 'ko' ? 'KOREAN (한국어)' : 'ENGLISH'}

JSON KEYS: event_category, event_action, event_label, description, item_no, screenshot_id.

1. EVENTCATEGORY: Fixed identifier (e.g., 메인화면_세부화면).
2. EVENTACTION: [Prefix] + [Action]. Prefixes: screen_view, click_, confirm_, popup_, toggle_, view_.
3. EVENTLABEL: Variable data like {Button Text} or {Title}.
4. DESCRIPTION: Clear explanation in the selected language.

Custom Rules: "${context.customRules || 'None'}"
Existing GA Context: "${context.existingTags || 'None'}"

Each screenshot is independent. item_no starts at 1 for each.
Detect ALL meaningful UI elements.
`;

export const analyzeImage = async (
  screenshots: Screenshot[],
  language: Language,
  context: ProjectContext,
  currentAnalysisResults: Record<string, ScreenAnalysis> | null, 
  activeScreenshotId?: string,
  selection?: SelectionRect,
  signal?: AbortSignal
): Promise<ParsedAnalysis> => {
  /**
   * Safe API Key retrieval:
   * Prioritize process.env.API_KEY as per instructions, 
   * but fall back to VITE_API_KEY for the user's specific Vercel environment.
   */
  const apiKey = (typeof process !== 'undefined' && process.env.API_KEY) 
    ? process.env.API_KEY 
    : (import.meta as any).env?.VITE_API_KEY;
  
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  // Create instance inside the function right before the call.
  const ai = new GoogleGenAI({ apiKey });
  
  const screenshotMapping = screenshots.map((s, i) => `Image Index ${i} = ID: ${s.id}`).join('\n');
  const systemInstruction = generateSystemInstruction(language, context);
  
  const parts: any[] = [
    { text: `Analyze the provided images for GA4 tagging. \n\nIMAGE ID MAPPING:\n${screenshotMapping}` }
  ];

  screenshots.forEach(s => {
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: s.base64.split(',')[1] || s.base64
      }
    });
  });

  if (selection) {
    parts.push({ 
      text: `\n\nFOCUS: For the ACTIVE IMAGE, strictly detect region: x=${selection.x}, y=${selection.y}, w=${selection.w}, h=${selection.h}.`
    });
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: { 
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            screens: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  screenshot_id: { type: Type.STRING },
                  events: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item_no: { type: Type.INTEGER },
                        event_category: { type: Type.STRING },
                        event_action: { type: Type.STRING },
                        event_label: { type: Type.STRING },
                        description: { type: Type.STRING }
                      },
                      required: ["item_no", "event_category", "event_action", "event_label", "description"]
                    }
                  },
                  annotations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item_no: { type: Type.INTEGER },
                        label: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        display_priority: { type: Type.INTEGER },
                        bbox: {
                          type: Type.OBJECT,
                          properties: {
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                            w: { type: Type.NUMBER },
                            h: { type: Type.NUMBER }
                          },
                          required: ["x", "y", "w", "h"]
                        }
                      },
                      required: ["item_no", "label", "bbox"]
                    }
                  }
                },
                required: ["screenshot_id", "events", "annotations"]
              }
            }
          },
          required: ["screens"]
        }
      } 
    });

    if (signal?.aborted) {
      throw new Error("AbortError");
    }

    const text = response.text || "";
    return parseGeminiResponse(text);

  } catch (error: any) {
    if (signal?.aborted || error?.message === "AbortError") {
      throw new Error("AbortError");
    }
    console.error("Gemini API Error:", error);
    throw error;
  }
};

const parseGeminiResponse = (text: string): ParsedAnalysis => {
  const extracted = extractJson<any>(text);
  const results: Record<string, ScreenAnalysis> = {};

  if (extracted && extracted.screens && Array.isArray(extracted.screens)) {
    extracted.screens.forEach((screen: any) => {
       const sid = screen.screenshot_id;
       if (sid) {
           results[sid] = {
               events: Array.isArray(screen.events) ? screen.events : [],
               annotations: Array.isArray(screen.annotations) ? screen.annotations : []
           };
       }
    });
  }

  return { results };
};

function extractJson<T>(str: string): T | null {
  try {
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(str.substring(start, end + 1));
    }
  } catch (e) {
    console.error("Failed to parse JSON", e);
  }
  return null;
}
