
export interface TaggingEvent {
  item_no: number;
  event_category: string;
  event_action: string;
  event_label: string;
  description: string;
}

export interface TaggingJSON {
  events: TaggingEvent[];
}

export interface OverlayAnnotation {
  item_no: number;
  label: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  confidence: number;
  display_priority: number;
}

export interface OverlayJSON {
  screenshot_id: string;
  annotations: OverlayAnnotation[];
}

export interface ScreenAnalysis {
  events: TaggingEvent[];
  annotations: OverlayAnnotation[];
}

export interface ParsedAnalysis {
  results: Record<string, ScreenAnalysis>;
}

export type Language = 'en' | 'ko';

export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Screenshot {
  id: string;
  base64: string;
  name: string;
}

export interface ProjectContext {
  customRules: string;
  existingTags: string;
}

export interface ViewState {
  zoom: number;
  offset: { x: number; y: number };
  manual?: boolean;
}