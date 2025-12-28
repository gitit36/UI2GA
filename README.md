# UI2GA — AI Tagging Architect

UI2GA is a specialized senior-level frontend engineering tool that transforms UI screenshots into professional GA4 (Google Analytics 4) tagging specifications using Google Gemini 3.

## 🚀 Key Features

- **Precise UI Detection**: Automatically identifies buttons, inputs, toggles, and lists for tracking.
- **Interactive Region Selection**: Drag to select specific areas for focused analysis, or analyze full screens.
- **Multi-Screen Workflows**: Manage multiple screens simultaneously to map complex user flows.
- **Contextual Tagging**: Infuses custom rules and existing GA context for consistent enterprise naming conventions.
- **Advanced Visualization**: 
  - **Interactive Workspace**: High-performance canvas with Zoom & Pan capabilities.
  - **Hover Sync**: Hovering an annotation on the image highlights its corresponding row in the tagging table for instant context.
  - **Smart Positioning**: Item No. 1 follows a unique "drop-down" rule to ensure visibility, while others pop up.
- **Professional Exports**: 
  - **Figma-Ready SVG**: High-fidelity export including the annotated image and formatted data table.
  - **Data Formats**: Download specs as CSV, XLSX, JSON, or Markdown.
- **Multilingual Support**: Tailored output logic for both Korean (enterprise standards) and English.

## 🛠 Tech Stack

- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI Engine**: Google Gemini API (`gemini-3-flash-preview`)
- **Graphics**: HTML5 Canvas & SVG

## 📖 How to Use

1. **Upload**: Drag and drop one or more UI screenshots into the uploader.
2. **Configure**: Define custom rules (e.g., *"Use 'tap_' prefix for buttons"*) in the sidebar.
3. **Select (Optional)**: Drag on the image to define a specific analysis region if you don't need the full screen.
4. **Analyze**: Click "Analyze UI" to generate the GA tagging plan via Gemini.
5. **Review & Refine**: 
   - Double-click cells in the table to edit values directly.
   - Use the **Space + Drag** shortcut to navigate high-resolution screenshots.
6. **Export**: Use the top toolbar to download specifications in your preferred format or export to Figma.

## ⌨️ Shortcuts

- **Spacebar + Drag**: Pan image workspace.
- **Mouse Wheel / Scroll**: Zoom in and out.
- **Hover Annotation**: Instantly highlight the corresponding tagging row.
- **Double Click Table Cell**: Enter edit mode for individual event data.

---

*Built for Analytics Engineers, Product Managers, and Growth Hackers.*