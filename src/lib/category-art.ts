/**
 * Deterministic artwork selection for storefront categories.
 *
 * Every category — including ones created later without an uploaded cover —
 * gets subject-appropriate artwork from its name/slug. Rules are ordered:
 * the first match wins.
 */

export type CategoryArtKind =
  | 'presentation'
  | 'lessons'
  | 'books'
  | 'templates'
  | 'video'
  | 'audio'
  | 'sheets'
  | 'documents'
  | 'design'
  | 'general';

export type CategoryArtAccent = 'mint' | 'amber' | 'green';

export type CategoryArt = { kind: CategoryArtKind; accent: CategoryArtAccent };

const KIND_ACCENT: Record<CategoryArtKind, CategoryArtAccent> = {
  presentation: 'amber',
  lessons: 'mint',
  books: 'green',
  templates: 'amber',
  video: 'mint',
  audio: 'green',
  sheets: 'amber',
  documents: 'mint',
  design: 'green',
  general: 'mint',
};

const RULES: Array<[CategoryArtKind, RegExp]> = [
  ['presentation', /عرض|تقديم|بوربوينت|شرائح|presentation|slide|powerpoint|keynote/i],
  ['video', /فيديو|مرئي|فيلم|محاضرة|video|movie|film|animation/i],
  ['audio', /صوت|صوتية|بودكاست|موسيقى|mp3|audio|music|podcast|sound|voice/i],
  ['books', /كتب|كتاب|ملخص|مقال|مكتبة|مرجع|قراءة|book|ebook|pdf|read|library/i],
  ['templates', /قالب|قوالب|نموذج|ثيم|تصميم|layout|template|theme|figma|canva/i],
  ['lessons', /تحضير|دروس|درس|خطة|منهج|مقرر|تدريب|دورة|تعليم|lesson|plan|curricul|educat|training|course/i],
  ['sheets', /جدول|جداول|إكسل|اكسل|بيانات|excel|sheet|spreadsheet|dataset/i],
  ['documents', /مستند|وثيقة|ملف|استمارة|نماذج|doc|word|form|document/i],
  ['design', /صورة|صور|رسم|رسوم|أيقون|شعار|icon|logo|graphic|image|photo|vector|illustration/i],
];

const FALLBACK_ACCENTS: CategoryArtAccent[] = ['mint', 'amber', 'green'];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function getCategoryArt(name: string, slug: string): CategoryArt {
  // Strip Arabic diacritics so "تَحضير" still matches the lessons rule.
  const text = `${name} ${slug}`.replace(/[\u064B-\u065F\u0670]/g, '');
  const kind = RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'general';

  // Unknown subjects still get a stable, distinct visual identity.
  const accent =
    kind === 'general'
      ? FALLBACK_ACCENTS[hash(slug || name) % FALLBACK_ACCENTS.length]
      : KIND_ACCENT[kind];

  return { kind, accent };
}
