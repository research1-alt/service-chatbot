import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy Route for Gemini
  app.post("/api/chatbot", async (req, res) => {
    const { query, context, chatHistory, language } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const languageMap: { [key: string]: string } = {
        'en-US': 'English', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
        'bn-IN': 'Bengali', 'gu-IN': 'Gujarati', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam',
        'pa-IN': 'Punjabi', 'ur-IN': 'Urdu', 'as-IN': 'Assamese', 'or-IN': 'Odia',
    };
    const targetLanguageName = languageMap[language] || 'English';

    try {
        const ai = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY, 
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build',
                }
            } 
        });
        
        const systemInstruction = `YOU ARE THE "OSM TECHNICAL MENTOR"—A HIGH-PRECISION REASONING ENGINE FOR OMEGA SEIKI MOBILITY.

### CORE OBJECTIVE:
Your primary mission is to extract technical specifications (specifically MCU and Encoder pin positions) from the provided [MASTER DATABASE] (Spreadsheet) and [SUPPLEMENTAL MANUALS].

### DATA HANDLING PROTOCOLS:
1. **PRIORITY SOURCE**: The [MASTER DATABASE] is your SOURCE OF TRUTH for specific pin mappings. It is provided in CSV format. 
2. **SEARCH LOGIC**: 
   - When a user asks for "pin position", "mcu side", "encoder side", or "connector", you MUST scan every row of the Spreadsheet for those keywords.
   - Match the vehicle type (e.g., "Virya Gen 1", "Matel", "Gen 2") to the technical values.
3. **FALLBACK**: Use [SUPPLEMENTAL MANUALS] only if the spreadsheet is missing the specific detail requested.
4. **DETERMINISTIC ACCURACY**: Do not guess. If a pin is mentioned as "Pin 4: 48V" in the CSV, output exactly that.

### FORMATTING RULES:
- **Tables**: Always use Markdown tables for pin layouts.
- **Steps**: Use [STEP X] for troubleshooting procedures.
- **Technical Terms**: Keep English technical terms (MCU, Pin, V, A, Ohm, CAN) even when translating the explanation.
- **Language**: Respond in ${targetLanguageName.toUpperCase()}.

### REFUSAL PROTOCOL:
If and only if the data is not in the CSV or the Manuals:
- Answer: "Technical parameter not found in current Master Sheet or Manuals."
- isUnclear: true.`;

        const fullPrompt = `### TECHNICAL CONTEXT:
${context || "No technical data loaded."}

### CONVERSATION HISTORY:
${chatHistory}

### USER QUERY:
"${query}"

### FINAL DIRECTIVE:
Identify the vehicle powertrain system mentioned. Search the [MASTER DATABASE] CSV data first. If found, present the pin position as a clear table. If not found there, search the [SUPPLEMENTAL MANUALS].`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash', 
            contents: [{ parts: [{ text: fullPrompt }] }],
            config: {
                systemInstruction,
                temperature: 0.0,
                topP: 0.1,
                topK: 1,
                seed: 12345,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        answer: { type: Type.STRING },
                        suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        isUnclear: { type: Type.BOOLEAN }
                    },
                    required: ["answer", "suggestions", "isUnclear"]
                }
            },
        });

        const responseText = response.text || "";
        console.log("Gemini Raw Response:", responseText); // Debugging
        
        const startIdx = responseText.indexOf('{');
        const endIdx = responseText.lastIndexOf('}') + 1;
        
        if (startIdx === -1 || endIdx <= startIdx) {
            throw new Error(`Invalid JSON response: ${responseText}`);
        }
        
        const data = JSON.parse(responseText.substring(startIdx, endIdx));
        res.json(data);
    } catch (error) {
        console.error("Chatbot Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error" });
    }
  });

  // API Proxy Route for Google Sheet Sync
  app.get("/api/sync-sheet", async (req, res) => {
    const MASTER_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9JdhdhfXumJA_tRoKVu6azf2hBAtQBec_QkRB4R_lNYv6jYwchV3vdzRWQTzAYqOLh24KwsKPQ2Ti/pub?output=csv";
    
    try {
        const response = await fetch(MASTER_SHEET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; OSM-Service-Bot/1.0)'
            }
        });
        if (!response.ok) {
            console.error(`Sheet Sync Proxy Error: Failed to fetch (Status: ${response.status})`);
            throw new Error(`Cloud access denied (Status: ${response.status})`);
        }
        const csvData = await response.text();
        res.type('text/csv').send(csvData);
    } catch (error) {
        console.error("Sheet Sync Proxy Error:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : "Cloud access denied" });
    }
  });


  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: distPath needs to be correct for production
    const distPath = path.join(__dirname, 'dist', 'client'); // vite build puts them in dist/client by default
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
