# UI2GA - AI GA4 Tagging Architect

UI2GA is a world-class, AI-powered tool designed to transform UI screenshots into exhaustive GA4 (Google Analytics 4) tagging plans. It leverages the Google Gemini API to "see" and "understand" UI components, generating professional-grade tracking specifications automatically.

## 🚀 Key Features

- **🤖 Precise UI Detection**: Automatically identifies buttons, input fields, navigation elements, and content structures using the latest Gemini Vision models.
- **🎯 Interactive Workspace**: A high-performance canvas that supports zooming, panning (Space + Drag), and region selection for focused analysis.
- **🎨 Smart Annotations**: Every detected event is mapped 1:1 with a bounding box annotation on the image, ensuring visual clarity for developers and PMs.
- **🧩 Figma Integration**:
  - **Import**: Direct ingestion of Figma frames via `postMessage` protocol (Base64 DataURL).
  - **Export**: Bi-directional SVG export that allows the web app to send annotated tracking plans directly back into a Figma page when running as a plugin.
- **🌍 Multilingual Intelligence**: Full support for English and Korean, with localized tagging logic (e.g., Korean-first enterprise naming standards).
- **📊 Professional Exports**: Generate plans in Markdown, CSV, XLSX, JSON, and SVG formats.

## 🛠 Tech Stack

- **Frontend**: React 19 (ES6 Modules)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI Engine**: Google GenAI SDK (`@google/genai`)
- **Models**: `gemini-3-pro-preview` for high-reasoning UI analysis.

## 🔌 Figma Plugin Integration

UI2GA is designed to work seamlessly within a Figma Plugin iframe.

### Inbound (Figma to Web)
The app listens for a specific message type to import images:
```javascript
window.postMessage({
  type: "UI2GA_IMPORT_IMAGE_BASE64",
  payload: {
    dataUrl: "data:image/png;base64,...",
    screenshotName: "Home_Screen_Final"
  }
}, "*");
```

### Outbound (Web to Figma)
When running inside an iframe, the "Export to Figma" button switches from a standard file download to a direct message transmission:
```javascript
window.parent.postMessage({
  type: "UI2GA_EXPORT_SVG",
  payload: {
    svgText: "<svg>...</svg>",
    screenshotId: "A0001"
  }
}, "*");
```

## ⚙️ Configuration

To use the AI analysis features, ensure the `API_KEY` environment variable is set in your deployment environment (e.g., Vercel, Netlify).

```env
API_KEY=your_google_gemini_api_key_here
```

## ⌨️ Shortcuts

- **Spacebar + Drag**: Pan around the image.
- **Mouse Wheel**: Zoom in/out.
- **Double-Click Cell**: Edit tagging event text directly in the table.
- **Drag on Image**: Select a specific region for partial analysis.

---
© 2025 Sangjin Lee / UI2GA. All rights reserved.
