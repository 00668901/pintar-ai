import { GoogleGenAI, Content, Part, Type } from "@google/genai";
import { Message, LearningMode, VisionFile, QuizQuestion } from "../types";
// @ts-ignore
import JSON5 from "json5";

// Helper to get the API Key safely
// Priority: 
// 1. LocalStorage (User entered key in Settings)
// 2. Vite Environment Variable (VITE_API_KEY)
// 3. Process Env (API_KEY) - Legacy/Vercel
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
  const base = "Kamu adalah PintarAI, asisten belajar yang cerdas, ramah, dan sangat membantu untuk siswa di Indonesia. Gunakan Bahasa Indonesia yang formal namun santai. Gunakan Markdown yang rapi.";
  
  switch (mode) {
    case LearningMode.MATH:
      return `${base} Kamu ahli dalam Matematika dan Sains. Jika diberikan soal, jelaskan langkah demi langkah (step-by-step) cara menyelesaikannya. Gunakan LaTeX untuk rumus matematika (contoh: $x^2$). Jangan berikan jawaban langsung tanpa penjelasan. Setelah memberikan solusi, berikan 1-3 pertanyaan pilihan ganda (Multiple Choice Questions) singkat terkait konsep yang baru saja dijelaskan untuk menguji pemahaman siswa.`;
    case LearningMode.INTERACTIVE:
      return `${base} Kamu adalah tutor interaktif. Jelaskan konsep yang ditanyakan pengguna dengan jelas dan menarik. SETELAH penjelasan selesai, kamu WAJIB memberikan kuis singkat berupa 1-3 pertanyaan pilihan ganda (A, B, C, D) untuk menguji pemahaman siswa tentang topik tersebut.`;
    case LearningMode.SUMMARIZER:
      return `${base} Tugasmu adalah merangkum materi pelajaran menjadi catatan yang SANGAT RAPI, TERSTRUKTUR, dan LENGKAP, mirip dengan format buku teks atau catatan siswa teladan.
      
      ATURAN FORMAT WAJIB (Ikuti gaya ini):
      1. **Judul Bab/Topik**: Gunakan Heading 2 (##) atau Heading 3 (###).
      2. **Poin Utama**: Gunakan Numbered List (1, 2, 3).
         - Format baris harus: **Istilah/Konsep Penting**: Penjelasan detail.
      3. **Sub-poin**: Jika ada detail lebih lanjut, gunakan bullet points (-) di bawah nomor.
      4. **Contoh**: Berikan bagian khusus "Contoh" atau "Implementasi" agar mudah dimengerti.
      5. **Hierarki**: Pastikan hierarki informasi jelas (Misal: Definisi -> Ciri-ciri -> Contoh).
      
      JANGAN buat paragraf panjang yang membosankan. Pecah menjadi poin-poin yang mudah dibaca (scannable).`;
    case LearningMode.WRITING:
      return `${base} Kamu membantu siswa menulis esai. Berikan feedback konstruktif, saran perbaikan tata bahasa, dan ide pengembangan paragraf.`;
    case LearningMode.GENERAL:
    default:
      return `${base} Jawab pertanyaan siswa dengan jelas dan ringkas. Jika pertanyaan ambigu, tanya balik untuk klarifikasi.`;
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
  
  // Check if AI is initialized
  if (!ai) {
      onChunk("⚠️ **Konfigurasi Diperlukan**: API Key belum ditemukan.\n\nSilakan klik tombol **Pengaturan (⚙️)** di pojok kiri bawah sidebar dan masukkan Google Gemini API Key Anda agar aplikasi dapat berjalan.");
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

// Function for Notes Mode
export const generateNoteSummary = async (
  images: VisionFile[],
  contextText: string = ""
): Promise<{ title: string, content: string, quiz: QuizQuestion[] }> => {
  const ai = getAIClient();

  if (!ai) {
      return {
          title: "Error Konfigurasi",
          content: "API Key belum di-setting. Mohon masukkan API Key di menu Pengaturan (ikon Gear).",
          quiz: []
      };
  }

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

  const prompt = `Analisis materi yang diberikan (baik dari gambar atau teks tambahan).
  1. Identifikasi topik utama untuk dijadikan judul yang singkat dan jelas.
  2. Buatlah rangkuman catatan belajar yang lengkap, terstruktur, dan mudah dipahami dalam format Markdown. 
     - Gunakan gaya penulisan: 1. **Konsep**: Penjelasan.
     - Sertakan contoh nyata.
  3. Buatlah kuis pilihan ganda (Multiple Choice) untuk menguji pemahaman siswa.
     - JUMLAH SOAL: Buatlah TEPAT 10 (SEPULUH) SOAL.
     - Tingkat kesulitan: Bervariasi (Mudah, Sedang, Sulit).
     - Sertakan kunci jawaban dan penjelasan (pembahasan) singkat untuk setiap soal.
  
  IMPORTANT RESPONSE FORMAT RULES:
  - Output MUST be strictly valid JSON.
  - When writing Math or LaTeX (e.g., inside 'content' or 'question'), you MUST escape backslashes properly for JSON strings.
    Example: use "\\\\frac{a}{b}" instead of "\\frac{a}{b}".
  - Do NOT output Markdown code blocks (like \`\`\`json). Just the raw JSON string.

  ${contextText ? `\nTambahan konteks dari dokumen:\n${contextText}` : ''}`;

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { role: 'user', parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING, description: "The correct option text exactly as it appears in options" },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "answer", "explanation"]
              }
            }
          },
          required: ["title", "content", "quiz"]
        }
      }
    });
    
    if (response.text) {
        try {
            // Using JSON5 for more lenient parsing
            return JSON5.parse(response.text);
        } catch (e) {
            console.warn("JSON5 parse failed, attempting fallback cleanup", e);
            let cleanText = response.text.replace(/```json\n?|```/g, '');
            return JSON5.parse(cleanText);
        }
    }
    throw new Error("Empty response text");
  } catch (error) {
    console.error("Summary Error:", error);
    return { 
      title: `Catatan ${new Date().toLocaleDateString()}`, 
      content: contextText 
        ? `## Ringkasan Gagal Dimuat\n\nMaaf, kami mengalami kendala memproses respons AI. Namun berikut adalah teks yang berhasil diekstrak dari dokumen Anda:\n\n${contextText.slice(0, 3000)}...` 
        : "Terjadi kesalahan saat memproses materi. Mohon coba lagi dengan gambar yang lebih jelas atau file yang valid.",
      quiz: []
    };
  }
};

// Function to Regenerate Quiz only
export const regenerateQuiz = async (
  content: string
): Promise<QuizQuestion[]> => {
  const ai = getAIClient();
  if (!ai) return [];

  const model = "gemini-2.5-flash";
  
  const prompt = `Berdasarkan rangkuman materi berikut, buatlah 10 (SEPULUH) soal kuis pilihan ganda BARU yang berbeda dari sebelumnya jika memungkinkan.
  
  MATERI:
  ${content}

  IMPORTANT:
  - Return ONLY a JSON Array of objects.
  - Structure per object: { question, options (array of strings), answer (string), explanation (string) }
  - Escape LaTeX properly.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    });

    if (response.text) {
      try {
        return JSON5.parse(response.text);
      } catch (e) {
         const cleanText = response.text.replace(/```json\n?|```/g, '');
         return JSON5.parse(cleanText);
      }
    }
    return [];
  } catch (error) {
    console.error("Regenerate Quiz Error", error);
    return [];
  }
};