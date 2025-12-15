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
      return `${base} Tugasmu adalah merangkum materi pelajaran menjadi MODUL PEMBELAJARAN LENGKAP. Jangan membuat ringkasan yang terlalu singkat.
      
      ATURAN FORMAT WAJIB:
      1. **Judul Bab/Topik**: Gunakan Heading 2 (##).
      2. **Poin Utama (MENDALAM)**: 
         - Gunakan Numbered List. 
         - Jelaskan setiap poin dengan PARAGRAF DESKRIPTIF (minimal 3-5 kalimat per poin). 
         - Jelaskan "Mengapa" dan "Bagaimana", jangan hanya definisi singkat.
         - Gunakan analogi yang mudah dimengerti jika konsepnya sulit.
      3. **CONTOH PROGRAM (LENGKAP DENGAN OUTPUT)**: 
         - JIKA materi berkaitan dengan Pemrograman/Algoritma/IT, kamu WAJIB memberikan contoh kode.
         - **BAHASA WAJIB**: Berikan contoh dalam 3 bahasa: **C**, **COBOL**, dan **C++** (JANGAN gunakan Python).
         - **OUTPUT WAJIB**: Di bawah SETIAP blok kode program, kamu WAJIB membuat blok kode terpisah yang berisi **HASIL OUTPUT** dari program tersebut. Gunakan label "Output:" sebelum blok kode output.
         - Format:
           (Penjelasan singkat)
           \`\`\`c
           // Kode C
           printf("Hello");
           \`\`\`
           **Output Program:**
           \`\`\`text
           Hello
           \`\`\`
      4. **Studi Kasus**: Jika bukan coding, berikan contoh penerapan nyata.
      5. **Hierarki**: Pastikan struktur jelas, gunakan Sub-heading (###) untuk memecah topik panjang.`;
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
  contextText: string = "",
  fileCount: number = 1
): Promise<{ title: string, content: string, quiz: QuizQuestion[] }> => {
  const ai = getAIClient();

  if (!ai) {
      return {
          title: "Error Konfigurasi",
          content: "API Key belum di-setting. Mohon masukkan API Key di menu Pengaturan (ikon Gear).",
          quiz: []
      };
  }

  // Use Pro model for better reasoning on large contexts if many files, otherwise Flash
  const model = fileCount >= 5 ? "gemini-3-pro-preview" : "gemini-2.5-flash";
  
  // Logic for question count based on file count
  const mcqCount = fileCount >= 5 ? 20 : 10;
  const essayCount = 5;

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
  2. Buatlah MODUL BELAJAR LENGKAP & MENDALAM.
     - **Penjelasan Detail (WAJIB PANJANG)**: Penjelasan harus berbentuk narasi paragraf yang panjang dan mendalam. Hindari penggunaan poin-poin yang terlalu singkat. Jelaskan definisi, latar belakang, cara kerja, dan alasan mengapa konsep ini penting. Anggap pembaca adalah pemula yang butuh penjelasan tuntas.
     - **Struktur**: Gunakan Heading (##) dan Sub-heading (###) agar rapi.
     - **CONTOH PROGRAM (WAJIB ADA)**: JIKA materi berkaitan dengan Algoritma, Pemrograman, atau Komputer:
        a. Kamu WAJIB memberikan contoh kode lengkap dalam 3 bahasa: **C**, **COBOL**, dan **C++**.
        b. **JANGAN gunakan Python**.
        c. **OUTPUT WAJIB**: Di bawah SETIAP blok kode program, buatlah blok kode terpisah dengan label "Output Program" yang berisi hasil eksekusi program tersebut. Gunakan format code block \`text\` untuk output.
        d. Berikan penjelasan logika di setiap baris kode yang krusial.
     - **Contoh Kasus**: Jika materi Sains/Matematika, berikan contoh perhitungan langkah demi langkah.
  3. Buatlah Kuis Evaluasi:
     - BAGIAN A: ${mcqCount} Soal Pilihan Ganda (Multiple Choice).
     - BAGIAN B: ${essayCount} Soal Esai (Uraian).
     - **KHUSUS MATERI IT/PEMROGRAMAN (WAJIB)**: 
       - Pada Bagian B (Esai), kamu WAJIB menyertakan soal **"Lengkapi Kode" (Code Completion)** atau **"Analisis Kode"**.
       - Sertakan potongan kode (snippet) di dalam teks soal (gunakan format markdown \`\`\`) yang memiliki bagian rumpang atau bug.
       - Minta siswa melengkapi atau memperbaiki kode tersebut.
  
  IMPORTANT RESPONSE FORMAT RULES:
  - Output MUST be strictly valid JSON.
  - Separate MCQ and Essay questions in the JSON structure.
  - Escape backslashes properly for JSON strings (e.g. LaTeX).

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
            mcq_questions: {
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
            },
            essay_questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING, description: "Key points or sample answer" },
                  explanation: { type: Type.STRING, description: "Additional context or explanation" }
                },
                required: ["question", "answer", "explanation"]
              }
            }
          },
          required: ["title", "content", "mcq_questions", "essay_questions"]
        }
      }
    });
    
    if (response.text) {
        let parsedData;
        try {
            parsedData = JSON5.parse(response.text);
        } catch (e) {
            console.warn("JSON5 parse failed, attempting fallback cleanup", e);
            let cleanText = response.text.replace(/```json\n?|```/g, '');
            parsedData = JSON5.parse(cleanText);
        }

        // Combine MCQ and Essay into uniform QuizQuestion structure
        const quiz: QuizQuestion[] = [
            ...(parsedData.mcq_questions || []).map((q: any) => ({ ...q, type: 'mcq' })),
            ...(parsedData.essay_questions || []).map((q: any) => ({ ...q, type: 'essay', options: [] }))
        ];

        return {
            title: parsedData.title,
            content: parsedData.content,
            quiz: quiz
        };
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
  
  const prompt = `Berdasarkan rangkuman materi berikut, buatlah kuis evaluasi campuran:
  1. 5 Soal Pilihan Ganda (MCQ).
  2. 2 Soal Esai.
  
  ATURAN KHUSUS (WAJIB):
  - Jika materi berhubungan dengan Pemrograman/IT:
    Buatlah soal esai berupa **STUDI KASUS KODE**.
    Berikan snippet kode singkat dalam pertanyaan (gunakan markdown), lalu minta siswa melengkapi kode yang rumpang atau menebak outputnya.
  
  MATERI:
  ${content}

  IMPORTANT:
  - Return JSON object with two arrays: 'mcq_questions' and 'essay_questions'.
  - Escape LaTeX properly.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
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
         const cleanText = response.text.replace(/```json\n?|```/g, '');
         const parsed = JSON5.parse(cleanText);
         return [
            ...(parsed.mcq_questions || []).map((q: any) => ({ ...q, type: 'mcq' })),
            ...(parsed.essay_questions || []).map((q: any) => ({ ...q, type: 'essay', options: [] }))
         ];
      }
    }
    return [];
  } catch (error) {
    console.error("Regenerate Quiz Error", error);
    return [];
  }
};