
import { GoogleGenAI, Type, Modality } from "@google/genai";

interface GeminiResponse {
    answer: string;
    suggestions: string[];
    isUnclear: boolean;
}

const languageMap: { [key: string]: string } = {
    'en-US': 'English',
    'hi-IN': 'Hindi',
    'mr-IN': 'Marathi',
    'ta-IN': 'Tamil',
    'te-IN': 'Telugu',
    'bn-IN': 'Bengali',
    'gu-IN': 'Gujarati',
    'kn-IN': 'Kannada',
    'ml-IN': 'Malayalam',
    'pa-IN': 'Punjabi',
    'ur-IN': 'Urdu',
    'as-IN': 'Assamese',
    'or-IN': 'Odia',
};

export async function getChatbotResponse(
    query: string, 
    context: string | null,
    chatHistory: string,
    language: string,
): Promise<{ answer: string, suggestions: string[], isUnclear: boolean }> {
  try {
    const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context, chatHistory, language })
    });
    
    if (!response.ok) {
        throw new Error(`Proxy error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error("OSM AI Failure:", error);
    return {
        answer: "Technical Engine Proxy Error. Please ensure the server is configured.",
        suggestions: ["Retry Query"],
        isUnclear: true
    };
  }
}

export async function generateSpeech(text: string, language: string): Promise<string> {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return '';
        const ai = new GoogleGenAI({ apiKey });
        const targetLanguageName = languageMap[language] || 'English';

        const cleanText = text
            .replace(/SAFETY WARNING:/g, 'Warning.')
            .replace(/!\[.*?\]\(.*?\)/g, 'Refer to drawing.') 
            .replace(/(https?:\/\/[^\s\n)]+)/g, '')
            .replace(/\[STEP \d+\]/g, 'Step.')
            .replace(/[*#_~`>]/g, '')
            .replace(/\|/g, ' ') 
            .trim();

        if (!cleanText) return '';

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: `Read clearly in ${targetLanguageName}: ${cleanText}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { 
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } 
                },
            },
        });
        
        return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || '';
    } catch (error) {
        return '';
    }
}
