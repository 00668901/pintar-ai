import { GoogleGenAI, Content, Part, Type } from "@google/genai";
import { Message, LearningMode, VisionFile, QuizQuestion } from "../types";
// @ts-ignore
import JSON5 from "json5";

// Helper to get the API Key safely
const getApiKey = (): string | null => {
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey && localKey.trim().length > 0) return localKey;

    // Check Vite Env
    // @ts-ignore
    if (import.meta.env && import.meta.env.VITE_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_API_KEY;
    }

    // Check Process Env (Legacy)
    if (process.env.API_KEY && process.env.API_KEY !== 'undefined') {
        return process.env.API_KEY;
    }

    return null;
};

// Helper to get initialized AI Client
const getAIClient = (): GoogleGenAI | null => {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

const getSystemInstruction = (mode: LearningMode): string => {
  const base = "Kamu adalah PintarAI, asisten belajar yang cerdas. Gunakan Bahasa Indonesia yang formal namun santai. Gunakan Markdown yang rapi.";
  
  switch (mode) {
    case LearningMode.MATH:
      return `${base} Jelaskan langkah demi langkah. Gunakan LaTeX ($x^2$). Setelah solusi, berikan 1-3 soal latihan pilihan ganda.`;
    case LearningMode.INTERACTIVE:
      return `${base} Jelaskan konsep. SETELAH penjelasan, WAJIB berikan 1-3 kuis pilihan ganda singkat.`;
    case LearningMode.SUMMARIZER:
      return `${base} Rangkum materi menjadi MODUL PEMBELAJARAN MENDALAM.
      - Penjelasan harus NARATIF, PANJANG, dan MENDETAIL (bukan hanya poin-poin).
      - Fokus pada KONSEP, LOGIKA, dan USE CASES, jangan hanya membahas tipe data/sintaks dasar.
      - JIKA MATERI IT/CODING: Berikan contoh kode HANYA dalam bahasa **C** dan **COBOL**. Sertakan blok OUTPUT programnya.`;
    case LearningMode.WRITING:
      return `${base} Bantu menulis esai dan feedback tata bahasa.`;
    case LearningMode.GENERAL:
    default:
      return `${base} Jawab jelas dan ringkas.`;
  }
};

export const streamGeminiResponse = async (
  history: Message[],
  currentText: string,
  currentImages: VisionFile[], 
  mode: LearningMode,
  onChunk: (text: string) => void,
  onFinish?: (usage: { promptTokens: number; responseTokens: number; totalTokens: number }) => void
) => {
  const ai = getAIClient();
  
  if (!ai) {
      onChunk("⚠️ **Konfigurasi Diperlukan**: API Key belum ditemukan.\n\nSilakan klik tombol **Pengaturan (⚙️)** di pojok kiri bawah sidebar dan masukkan Google Gemini API Key Anda.");
      return;
  }

  const isComplex = mode === LearningMode.MATH || mode === LearningMode.INTERACTIVE;
  const model = isComplex ? "gemini-3-pro-preview" : "gemini-2.5-flash";

  const pastContents: Content[] = history.map(msg => {
    const parts: Part[] = [];
    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(img => {
        const [header, data] = img.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        parts.push({ inlineData: { mimeType, data } });
      });
    }
    if (msg.text) {
      parts.push({ text: msg.text });
    }
    return {
      role: msg.role,
      parts: parts
    };
  });

  const currentParts: Part[] = [];
  currentImages.forEach(img => {
    currentParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });
  
  if (currentText) {
    currentParts.push({ text: currentText });
  }
  
  if (currentParts.length === 0) return;

  const contents = [...pastContents, { role: 'user', parts: currentParts }];

  try {
    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: contents,
      config: {
        systemInstruction: getSystemInstruction(mode),
        temperature: 0.7,
      }
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        onChunk(text);
      }
      if (chunk.usageMetadata && onFinish) {
        onFinish({
            promptTokens: chunk.usageMetadata.promptTokenCount || 0,
            responseTokens: chunk.usageMetadata.candidatesTokenCount || 0,
            totalTokens: chunk.usageMetadata.totalTokenCount || 0
        });
      }
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    let errorMsg = "\n\n*Maaf, terjadi kesalahan saat menghubungi server AI.*";
    if (error.message && error.message.includes("API key not valid")) {
        errorMsg = "\n\n⚠️ **API Key Tidak Valid**: Mohon cek kembali API Key di menu Pengaturan.";
    }
    onChunk(errorMsg);
  }
};

// --- REFACTORED: 2-STEP GENERATION TO PREVENT TRUNCATION ---

export const generateNoteSummary = async (
  images: VisionFile[],
  contextText: string = "",
  fileCount: number = 1
): Promise<{ title: string, content: string, quiz: QuizQuestion[] }> => {
  const ai = getAIClient();

  if (!ai) {
      return {
          title: "Error Konfigurasi",
          content: "API Key belum di-setting. Mohon masukkan API Key di menu Pengaturan.",
          quiz: []
      };
  }

  // STEP 1: GENERATE CONTENT ONLY (Markdown Mode - Safer against truncation)
  const model = "gemini-2.5-flash"; 

  const parts: Part[] = [];
  images.forEach(img => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });

  const promptContent = `
  Tugas: Analisis materi dan buat MODUL PEMBELAJARAN MENDALAM & KOMPREHENSIF.
  
  Instruksi Format Output (PENTING):
  1. Baris Pertama WAJIB diawali dengan "JUDUL: " diikuti judul materi.
  2. Baris Kedua dan seterusnya adalah ISI MATERI dalam format Markdown.
  
  Instruksi Isi Materi:
  - **PENJELASAN**: Harus SANGAT PANJANG, MENDETAIL, dan NARATIF. 
    - JANGAN hanya membahas Tipe Data atau Sintaks dasar.
    - Jelaskan KONSEP, LOGIKA, ALGORITMA, SEJARAH, dan KEGUNAAN NYATA (Use Cases).
    - Gunakan gaya bahasa buku teks akademik yang menjelaskan "Mengapa" dan "Bagaimana". 
    - Minimal 3-4 paragraf tebal per sub-topik.
  - **STRUKTUR**: Gunakan Heading 2 (##) untuk Bab Utama dan Heading 3 (###) untuk Sub-bab.
  
  - **KHUSUS MATERI PEMROGRAMAN/IT**:
    a. **BAHASA PEMROGRAMAN**: WAJIB memberikan contoh kode HANYA dalam bahasa **C** dan **COBOL** untuk setiap konsep yang dijelaskan. (Jangan gunakan Python, Java, dll).
    b. **BATASAN CONTOH**: Cukup 1 contoh program komplit untuk masing-masing bahasa (C dan COBOL) per sub-bab yang relevan.
    c. Kode harus ditulis dalam blok code markdown yang rapi.
    d. Di bawah setiap kode, WAJIB buat blok kode terpisah dengan label "TERMINAL OUTPUT" untuk hasil eksekusinya.
    e. **ANALISIS KODE**: Jelaskan logika kode C dan COBOL tersebut baris demi baris secara mendalam.
  
  ${contextText ? `\nKonteks Tambahan:\n${contextText}` : ''}
  `;

  parts.push({ text: promptContent });

  try {
    // 1. Generate The Content (Text Mode)
    const contentResponse = await ai.models.generateContent({
      model: model,
      contents: { role: 'user', parts: parts },
      config: {
        temperature: 0.7,
        maxOutputTokens: 8192, // Maximize token output
      }
    });

    const rawText = contentResponse.text || "";
    if (!rawText) throw new Error("Empty response from AI");

    // Parse Title and Content manually
    const titleMatch = rawText.match(/^JUDUL:\s*(.*)/i);
    const title = titleMatch ? titleMatch[1].trim() : "Ringkasan Materi";
    
    // Remove the title line from content to avoid duplication
    const content = rawText.replace(/^JUDUL:.*\n?/i, '').trim();

    // STEP 2: GENERATE QUIZ (Separate Request)
    // We pass the generated content to the quiz generator
    const quiz = await regenerateQuiz(content);

    return {
        title,
        content,
        quiz
    };

  } catch (error) {
    console.error("Summary Generation Error:", error);
    return { 
      title: `Catatan ${new Date().toLocaleDateString()}`, 
      content: contextText 
        ? `## Gagal Memproses AI\n\nMaaf, terjadi kesalahan saat menghubungi AI. Berikut teks yang terbaca:\n\n${contextText.slice(0, 3000)}...` 
        : "Terjadi kesalahan. Coba upload ulang atau gunakan file yang lebih kecil.",
      quiz: []
    };
  }
};

// Function to Regenerate Quiz
export const regenerateQuiz = async (
  content: string
): Promise<QuizQuestion[]> => {
  const ai = getAIClient();
  if (!ai) return [];

  // Limit content sent to quiz generator to prevent token overflow on input
  // 30,000 chars is roughly 7-8k tokens, safe for input context
  const safeContent = content.length > 30000 ? content.slice(0, 30000) + "..." : content;

  const prompt = `
  Berdasarkan materi berikut, buatlah Kuis Evaluasi yang komprehensif.
  
  MATERI:
  ${safeContent}
  
  TUGAS:
  Buat file JSON yang berisi 2 array: 'mcq_questions' dan 'essay_questions'.
  
  KOMPOSISI SOAL (WAJIB DIPATUHI):
  1. **10 Soal Pilihan Ganda (MCQ)**: 
     - Cakupan luas dari materi.
  2. **10 Soal Esai (Total)** dengan rincian:
     - **5 Soal Esai Teori**: Pertanyaan konseptual/analisis.
     - **5 Soal "Melengkapi Program" (Code Completion)**:
       - **KHUSUS MATERI IT/CODING**: Berikan snippet kode dalam soal (gunakan format markdown \`\`\`) yang rumpang/hilang sebagian.
       - **PENTING**: Gunakan bahasa **C** atau **COBOL** untuk soal melengkapi program (sesuai materi).
       - Minta siswa melengkapi baris tersebut atau menebak outputnya.
  
  IMPORTANT:
  - Output HARUS Valid JSON.
  - Escape backslash dan karakter spesial dalam string JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mcq_questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "answer", "explanation"]
              }
            },
            essay_questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["question", "answer", "explanation"]
                }
              }
          }
        }
      }
    });

    if (response.text) {
      try {
        const parsed = JSON5.parse(response.text);
        const quiz: QuizQuestion[] = [
            ...(parsed.mcq_questions || []).map((q: any) => ({ ...q, type: 'mcq' })),
            ...(parsed.essay_questions || []).map((q: any) => ({ ...q, type: 'essay', options: [] }))
        ];
        return quiz;
      } catch (e) {
         // Fallback cleanup if JSON is slightly malformed
         const cleanText = response.text.replace(/```json\n?|```/g, '');
         try {
            const parsed = JSON5.parse(cleanText);
            return [
                ...(parsed.mcq_questions || []).map((q: any) => ({ ...q, type: 'mcq' })),
                ...(parsed.essay_questions || []).map((q: any) => ({ ...q, type: 'essay', options: [] }))
            ];
         } catch (err2) {
             console.error("Quiz JSON Parse Failed", err2);
             return [];
         }
      }
    }
    return [];
  } catch (error) {
    console.error("Regenerate Quiz Error", error);
    return [];
  }
};