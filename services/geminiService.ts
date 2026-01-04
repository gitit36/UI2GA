import { GoogleGenAI } from "@google/genai";
import { ParsedAnalysis, ScreenAnalysis, Language, SelectionRect, Screenshot, ProjectContext } from "../types";

const generateSystemInstruction = (
  language: Language, 
  screenshots: Screenshot[],
  context: ProjectContext,
  selection?: SelectionRect
) => `
You are UI2GA, a world-class GA4 Tagging Architect.

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
- item_no
- screenshot_id

-------------------------------------------------
B) EVENTCATEGORY RULES (FIXED IDENTIFIER)
-------------------------------------------------
- EVENTCATEGORY is a **fixed screen/service identifier**
- EVENTCATEGORY MUST:
  - Use **selected_language + underscore (_)** naming
  - Follow the structure:
    {메인화면/서비스}_{세부화면/진입경로(필요시)}
  - Include popup / sliding entry context when applicable

Examples:
- 뉴스AI_사전신청
- 뉴스AI_사전신청_질문남기기
- 통합검색_자연어검색
- 통합검색_자연어검색_피드백
- 국내종목요약보기_슬라이딩_투자챔스

- Treat EVENTCATEGORY as a **stable analytics grouping key**

-------------------------------------------------
C) EVENTACTION RULES (USER ACTION IDENTIFIER)
-------------------------------------------------
EVENTACTION must use:
[Prefix] + [행위 or UI명]

Allowed prefixes and meanings:
- screen_view : full screen or page entry
- click_      : general interaction or exploratory click
- confirm_    : final decision, submission, or irreversible action
- popup_      : popup open / close actions
- toggle_     : state change (on/off)
- view_       : exposure or scroll-based visibility

Interpretation rules:
- click_ is the DEFAULT for most user interactions
  (tabs, list items, guide questions, navigation, etc.)
- confirm_ is used ONLY when the action represents:
  - submission
  - application
  - save
  - final confirmation
  - irreversible state change

Strict rules:
- Do NOT mix confirm_ and view_
- screen_view is ONLY for full screen entry
- view_ is ONLY for meaningful sections or scroll exposure
- Small UI elements (single buttons, icons) MUST NOT have view_

Safety / Default rule:
- If unsure whether an action represents a final decision,
  default to click_ and explain the user intent in description.

Button text handling:
- Fixed button text →
  - include the text in EVENTACTION
  - e.g. confirm_신청하기
- Variable button text →
  - EVENTACTION = UI or area name
  - EVENTLABEL = actual displayed text

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
- {검색창 입력내용}
- {고객 입력내용}

Rules:
- Use "{}" only to describe variables in the spec
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
\`\`\`json
{
  "screens": [
    {
      "screenshot_id": "screen_1_id",
      "events": [
        {
          "item_no": 1,
          "event_category": "home",
          "event_action": "view_home",
          "event_label": "(not_set)",
          "description": "Home screen loaded"
        },
        {
          "item_no": 2,
          "event_category": "home",
          "event_action": "click_login",
          "event_label": "gnb",
          "description": "Login button"
        }
      ],
      "annotations": [
        { "item_no": 1, "label": "view_home", "bbox": { "x":0, "y":0, "w":1, "h":1 } },
        { "item_no": 2, "label": "click_login", "bbox": { "x":0.8, "y":0.05, "w":0.2, "h":0.1 } }
      ]
    }
  ]
}
\`\`\`
`;

// Helper to safely get the API key from various environment locations
const getApiKey = (): string | undefined => {
  // 1. Vite (Standard for Vercel React deployments)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  
  // 2. Standard process.env (Node / Webpack / fallback)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
    if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
    if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }

  return undefined;
};

export const analyzeImage = async (
  screenshots: Screenshot[],
  language: Language,
  context: ProjectContext,
  currentAnalysisResults: Record<string, ScreenAnalysis> | null, 
  activeScreenshotId?: string,
  selection?: SelectionRect,
  signal?: AbortSignal
): Promise<ParsedAnalysis> => {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API Key is missing. Please set VITE_API_KEY in your Vercel Environment Variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const screenshotMapping = screenshots.map((s, i) => `Image Index ${i} = ID: ${s.id}`).join('\n');
  
  const instructions = generateSystemInstruction(language, screenshots, context, selection) + `\n\nIMAGE ID MAPPING:\n${screenshotMapping}`;

  const contentParts: any[] = [{ text: instructions }];

  screenshots.forEach(s => {
    contentParts.push({
      inlineData: {
        mimeType: "image/png",
        data: s.base64.split(',')[1] || s.base64
      }
    });
  });

  if (selection) {
      contentParts.push({ text: `\n\nFOCUS INSTRUCTION: For the ACTIVE IMAGE, limit detection strictly to the region: x=${selection.x}, y=${selection.y}, w=${selection.w}, h=${selection.h}. Ignore elements outside.`});
  }

  try {
    const generatePromise = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: contentParts }],
      config: { temperature: 0.1 } 
    });

    let response;

    // Handle abort signal using Promise.race for immediate cancellation
    if (signal) {
        if (signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        
        response = await Promise.race([
            generatePromise,
            new Promise<never>((_, reject) => {
                const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
                signal.addEventListener('abort', onAbort);
            })
        ]);
    } else {
        response = await generatePromise;
    }

    // Explicit cast because Promise.race type inference can be tricky with SDK types
    const typedResponse = response as any;
    const text = typedResponse.text || "";
    return parseGeminiResponse(text);

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
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
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(str.substring(start, end + 1));
    }
  } catch (e) {
    console.error("Failed to parse JSON segment", e);
  }
  return null;
}