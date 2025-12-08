/**
 * File Parser Utility
 * Extracts text content from various file formats
 * Supported formats: .txt, .md, .json, .doc, .docx, .pdf
 */

// Supported file extensions
export const SUPPORTED_EXTENSIONS = ['txt', 'md', 'json', 'doc', 'docx', 'pdf'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// MIME types for file input accept attribute
export const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
].join(',');

// Accept string for file input
export const FILE_ACCEPT_STRING = '.txt,.md,.json,.doc,.docx,.pdf';

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Check if file extension is supported
 */
export function isSupportedFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension);
}

/**
 * Parse plain text files (.txt, .md)
 */
async function parseTextFile(file: File): Promise<string> {
  return await file.text();
}

/**
 * Parse JSON files and extract text content
 * Recursively extracts all string values from the JSON structure
 */
async function parseJsonFile(file: File): Promise<string> {
  const text = await file.text();

  try {
    const json = JSON.parse(text);
    const extractedTexts: string[] = [];

    function extractStrings(obj: unknown, depth = 0): void {
      if (depth > 10) return; // Prevent infinite recursion

      if (typeof obj === 'string' && obj.trim().length > 0) {
        extractedTexts.push(obj.trim());
      } else if (Array.isArray(obj)) {
        obj.forEach(item => extractStrings(item, depth + 1));
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(value => extractStrings(value, depth + 1));
      }
    }

    extractStrings(json);
    return extractedTexts.join('\n\n');
  } catch {
    // If JSON parsing fails, return raw text
    return text;
  }
}

/**
 * Parse Word documents (.doc, .docx) using mammoth
 * Uses dynamic import for code splitting
 */
async function parseWordDocument(file: File): Promise<string> {
  try {
    // @ts-expect-error - mammoth is aliased to browser version in vite.config.ts
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('Error parsing Word document:', error);
    throw new Error('Не удалось прочитать Word документ. Убедитесь, что файл не поврежден.');
  }
}

/**
 * Parse PDF documents using pdf.js
 * Uses dynamic import for code splitting
 */
async function parsePdfDocument(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ');
      textParts.push(pageText);
    }

    return textParts.join('\n\n');
  } catch (error) {
    console.error('Error parsing PDF document:', error);
    throw new Error('Не удалось прочитать PDF документ. Убедитесь, что файл не поврежден и содержит текст.');
  }
}

/**
 * Main function to parse any supported file format
 */
export async function parseFile(file: File): Promise<string> {
  const ext = getFileExtension(file.name);

  if (!isSupportedFile(file.name)) {
    throw new Error(
      `Неподдерживаемый формат файла: .${ext}. Поддерживаемые форматы: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  switch (ext) {
    case 'txt':
    case 'md':
      return await parseTextFile(file);

    case 'json':
      return await parseJsonFile(file);

    case 'doc':
    case 'docx':
      return await parseWordDocument(file);

    case 'pdf':
      return await parsePdfDocument(file);

    default:
      throw new Error(`Неподдерживаемый формат: .${ext}`);
  }
}

/**
 * Get human-readable format description
 */
export function getFormatDescription(): string {
  return 'Поддерживаемые форматы: TXT, MD, JSON, DOC, DOCX, PDF';
}
