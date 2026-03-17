// list-models.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  try {
    // We use the 'v1beta' endpoint specifically since that's what the Live API uses
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();

    console.log("--- Available Models for your API Key ---");
    data.models.forEach(model => {
        // We are looking for models that support 'bidiGenerateContent' 
        // (This is the method used for Voice/Live API)
        const supportsBidi = model.supportedGenerationMethods.includes('bidiGenerateContent');
        
        console.log(`Model: ${model.name}`);
        console.log(`Supports Live API (bidi): ${supportsBidi ? "✅ YES" : "❌ NO"}`);
        console.log("---------------------------------------");
    });
  } catch (error) {
    console.error("Error fetching models:", error);
  }
}

listModels();