import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAiBoringFacts = async (count: number): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate ${count} extremely mundane, boring, everyday facts that a person might say about their day. Examples: "I ate toast", "I walked the dog". Return ONLY the facts, one per line, no numbering.`,
    });
    
    if (response.text) {
      return response.text.split('\n').filter(line => line.trim().length > 0).slice(0, count);
    }
    return ["I breathed air today.", "I blinked twice.", "I stood still."];
  } catch (error) {
    console.error("Failed to generate facts:", error);
    return ["I breathed air today.", "I blinked twice.", "I stood still."];
  }
};

export const generateAiThumbnail = async (boringFact: string): Promise<string | null> => {
  try {
    const prompt = `Create a chaotic, clickbait YouTube thumbnail for a video based on this boring fact: "${boringFact}". 
    The thumbnail should be sensationalized, high contrast, colorful, and exaggerated. 
    Include things like shocked faces, red arrows, and explosions in the style. 
    Make it look like a viral video thumbnail.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
    });

    // Extract image
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part && part.inlineData && part.inlineData.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    console.error("Failed to generate thumbnail:", error);
    return null;
  }
};