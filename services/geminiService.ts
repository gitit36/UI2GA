
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ParsedAnalysis, ScreenAnalysis, Language, SelectionRect, Screenshot, ProjectContext } from "../types";

const generateSystemInstruction = (
  language: Language, 
  screenshots: Screenshot[],
  context: ProjectContext,
  selection?: SelectionRect
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
  // Directly use the environment variable as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });
  
  const screenshotMapping = screenshots.map((s, i) => `Image Index ${i} = ID: ${s.id}`).join('\n');
  const systemInstruction = generateSystemInstruction(language, screenshots, context, selection);
  
  const parts: any[] = [
    { text: systemInstruction + `\n\nIMAGE ID MAPPING:\n${screenshotMapping}` }
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
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: { 
        temperature: 0.1,
        responseMimeType: "application/json"
      } 
    });

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const text = response.text || "";
    return parseGeminiResponse(text);

  } catch (error: any) {
    if (signal?.aborted || error?.message === "Aborted") {
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
