
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ParsedAnalysis, ScreenAnalysis, Language, SelectionRect, Screenshot, ProjectContext } from "../types";

const generateSystemInstruction = (
  language: Language, 
  context: ProjectContext
) => `
You are UI2GA, a world-class GA4 Tagging Architect specialized in
Korean-first enterprise analytics standards.

=================================================
1. LANGUAGE & NAMING RULES (CRITICAL)
=================================================
Selected Language for OUTPUT TEXT:
- ${language === 'ko' ? 'KOREAN (한국어)' : 'ENGLISH'}

-------------------------------------------------
A) JSON KEYS (ALWAYS ENGLISH)
-------------------------------------------------
Always use the following English keys only:
- event_category
- event_action
- event_label
- description

-------------------------------------------------
B) EVENTCATEGORY RULES (FIXED IDENTIFIER)
-------------------------------------------------
- EVENTCATEGORY is a **fixed screen/service identifier**
- EVENTCATEGORY MUST:
  - Use **Korean + underscore (_)** naming by default
  - Follow the structure:
    {메인화면/서비스}_{세부화면/진입경로(필요시)}
  - Include popup / sliding entry context when applicable

Examples:
- 뉴스AI_사전신청
- 뉴스AI_사전신청_질문남기기
- 통합검색_자연어검색
- 통합검색_자연어검색_피드백
- 국내종목요약보기_슬라이딩_투자챔스

- EVENTCATEGORY does NOT change based on UI language selection
- Treat EVENTCATEGORY as a **stable analytics grouping key**

-------------------------------------------------
C) EVENTACTION RULES (USER ACTION IDENTIFIER)
-------------------------------------------------
EVENTACTION must use:
[Prefix] + [행위 or UI명]

Allowed prefixes and meanings:
- screen_view : screen/page entry
- tap_        : exploratory or lightweight interaction
- click_      : confirm / decision / submission
- popup_      : popup open/close actions
- toggle_     : state change switch (on/off)
- select_     : list or option selection
- view_       : exposure / scroll-based visibility

Strict rules:
- Do NOT mix click_ and view_
- screen_view is ONLY for full screen entry
- view_ is ONLY for meaningful sections or scroll exposure
- Small UI elements (single buttons, icons) MUST NOT have view_

Button text handling:
- Fixed button text → include in EVENTACTION
- Variable button text → 
  - EVENTACTION = UI/영역명
  - EVENTLABEL = 실제 문구

-------------------------------------------------
D) EVENTLABEL RULES (CONTEXTUAL IDENTIFIER)
-------------------------------------------------
EVENTLABEL is a **variable, context-preserving identifier**

Usage principles:
- Put ALL contextual information here that does not belong in
  EVENTCATEGORY or EVENTACTION
- Free text is allowed
- Prefer structured composition:
  {가변값1}_{가변값2}

Examples:
- {뉴스제목}
- {가이드질문}_{뉴스제목}
- {뉴스제목}_{질문내용}
- 뒤로가기_{컨텐츠명}
- {출처기사제목}
- {사용자 피드백 내용}

Rules:
- Use {} only to describe variables in the spec
- Actual output must contain real values, not variable names

-------------------------------------------------
E) DESCRIPTION
-------------------------------------------------
- description must be written in the selected output language
- Explain the user intent and tracking purpose clearly

-------------------------------------------------
F) EXISTING CONTEXT (MUST RESPECT)
-------------------------------------------------
Custom Rules:
"${context.customRules || 'None'}"

Existing GA Tags:
"${context.existingTags || 'None'}"

These act as constraints and must not be overridden.

=================================================
2. METICULOUS UI DETECTION RULES
=================================================
- Analyze ALL provided screenshots
- Detect ALL meaningful UI elements:
  Buttons, Inputs, Toggles, Cards, Lists, Links, Icons
- Silent omission is forbidden
- If ambiguous, still generate a tag and explain uncertainty

=================================================
3. NUMBERING SCOPE (STRICT)
=================================================
- Each screenshot is fully independent
- item_no MUST start from 1 for EACH screenshot
- Never continue numbering across screenshots

=================================================
4. STRICT OUTPUT SCHEMA
=================================================
Return a single JSON object with a "screens" array.

Each screen object MUST contain:
- screenshot_id (string)
- events: Array of
  { item_no, event_category, event_action, event_label, description }
- annotations: Array of
  { item_no, label, bbox: { x, y, w, h } }

BBox rules:
- x, y, w, h must be normalized values between 0.0 and 1.0

=================================================
RESPONSE FORMAT (STRICT JSON ONLY)
=================================================
Return ONLY valid JSON. No markdown. No explanations.
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
