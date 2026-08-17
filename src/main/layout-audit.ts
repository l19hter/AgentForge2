import type { WebContents } from 'electron'

/**
 * Аудит вёрстки числами.
 *
 * Половина того, что называют «нечеловечным дизайном», измеряется объективно:
 * контраст текста, разница кеглей между уровнями, разнобой отступов,
 * горизонтальное переполнение, длина строки, размер кликабельных зон. Это не
 * вкус — это факты, снятые с живой страницы, и по ним можно чинить так же, как
 * по падению сборки.
 *
 * Вкус остаётся за дизайнером: измеритель говорит «иерархии нет», а каким
 * именно кеглем её сделать — решает агент по дизайн-системе.
 */

export type LayoutKind =
  | 'contrast'
  | 'hierarchy'
  | 'rhythm'
  | 'overflow'
  | 'measure'
  | 'target'
  | 'density'

export interface LayoutFinding {
  kind: LayoutKind
  /** Что не так, человеческим языком и с числом. */
  text: string
}

export interface LayoutReport {
  findings: LayoutFinding[]
  /** Сводка для сравнения «до» и «после» правки дизайнера. */
  metrics: {
    worstContrast: number
    typeScale: number
    spacingValues: number
    overflowPx: number
  }
}

export const EMPTY_LAYOUT: LayoutReport = {
  findings: [],
  metrics: { worstContrast: 21, typeScale: 0, spacingValues: 0, overflowPx: 0 },
}

/**
 * Скрипт снимает мерки прямо на странице.
 *
 * Считает только видимое: скрытые узлы и пустые обёртки в статистику не идут,
 * иначе разнобой отступов набирается из невидимых элементов.
 */
const AUDIT_JS = `(() => {
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const parseColor = (c) => {
    const m = c && c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };

  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /** Фон под элементом: поднимаемся, пока не встретим непрозрачную заливку. */
  const backdrop = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.95) return c;
      node = node.parentElement;
    }
    const body = parseColor(getComputedStyle(document.body).backgroundColor);
    return body && body.a >= 0.95 ? body : { r: 255, g: 255, b: 255, a: 1 };
  };

  const all = [...document.querySelectorAll('body *')].filter(visible).slice(0, 600);

  // --- контраст: только узлы с собственным текстом ---
  let worst = 21, worstText = '';
  for (const el of all) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    const fg = parseColor(s.color), bg = backdrop(el);
    if (!fg || !bg || fg.a < 0.95) continue;
    const size = px(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need && r < worst) {
      worst = r;
      worstText = (el.textContent || '').trim().slice(0, 40);
    }
  }

  // --- иерархия: во сколько раз крупнейший заголовок больше основного текста ---
  const bodySize = px(getComputedStyle(document.body).fontSize) || 16;
  let maxHeading = 0;
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
    if (!visible(el)) continue;
    maxHeading = Math.max(maxHeading, px(getComputedStyle(el).fontSize));
  }
  const typeScale = maxHeading ? maxHeading / bodySize : 0;

  // --- ритм: сколько разных значений отступов используется ---
  const spacing = new Set();
  for (const el of all) {
    const s = getComputedStyle(el);
    for (const v of [s.paddingTop, s.paddingBottom, s.paddingLeft, s.paddingRight,
                     s.marginTop, s.marginBottom, s.gap]) {
      const n = px(v);
      if (n > 0 && n < 200) spacing.add(Math.round(n));
    }
  }

  // --- переполнение по горизонтали ---
  const root = document.documentElement;
  const overflow = Math.max(0, root.scrollWidth - root.clientWidth);

  // --- длина строки: сколько символов помещается в ширину абзаца ---
  let widestMeasure = 0;
  for (const el of document.querySelectorAll('p,li,blockquote,td')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const chars = el.getBoundingClientRect().width / (px(s.fontSize) * 0.5);
    if ((el.textContent || '').trim().length > 80) widestMeasure = Math.max(widestMeasure, chars);
  }

  // --- мелкие кликабельные зоны ---
  let tiny = 0;
  for (const el of document.querySelectorAll('button,a[href],input,select,[role="button"]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 32) tiny++;
  }

  // --- плотность: тянется ли содержимое на всю ширину окна ---
  const bodyRect = document.body.getBoundingClientRect();
  const stretched = bodyRect.width > 1100 && (() => {
    for (const el of all.slice(0, 80)) {
      const s = getComputedStyle(el);
      if (s.maxWidth && s.maxWidth !== 'none' && px(s.maxWidth) > 0) return false;
    }
    return true;
  })();

  return {
    worstContrast: Math.round(worst * 100) / 100,
    worstContrastText: worstText,
    typeScale: Math.round(typeScale * 100) / 100,
    bodySize: Math.round(bodySize),
    maxHeading: Math.round(maxHeading),
    spacingValues: spacing.size,
    spacingList: [...spacing].sort((a, b) => a - b).slice(0, 12),
    overflowPx: overflow,
    widestMeasure: Math.round(widestMeasure),
    tinyTargets: tiny,
    stretched,
  };
})()`

interface RawAudit {
  worstContrast: number
  worstContrastText: string
  typeScale: number
  bodySize: number
  maxHeading: number
  spacingValues: number
  spacingList: number[]
  overflowPx: number
  widestMeasure: number
  tinyTargets: number
  stretched: boolean
}

/**
 * Превращает мерки в замечания.
 *
 * Пороги взяты не с потолка: 4.5:1 — норма контраста для основного текста,
 * полуторный кегль — минимальная различимая ступень иерархии, 45–90 символов —
 * общепринятая длина строки, 32 пикселя — нижняя граница удобной кликабельной
 * зоны. Всё остальное — вкус, и его измеритель не трогает.
 */
function toFindings(a: RawAudit): LayoutFinding[] {
  const out: LayoutFinding[] = []

  if (a.worstContrast < 4.5) {
    out.push({
      kind: 'contrast',
      text: `Контраст текста ${a.worstContrast}:1 при норме 4.5:1${a.worstContrastText ? ` — например, «${a.worstContrastText}»` : ''}. Текст читается плохо.`,
    })
  }
  if (a.maxHeading === 0) {
    out.push({ kind: 'hierarchy', text: 'На странице нет ни одного заголовка — глазу не за что зацепиться.' })
  } else if (a.typeScale < 1.4) {
    out.push({
      kind: 'hierarchy',
      text: `Заголовок ${a.maxHeading}px против основного текста ${a.bodySize}px — разница всего в ${a.typeScale} раза. Иерархии не видно.`,
    })
  }
  if (a.spacingValues === 1) {
    out.push({ kind: 'rhythm', text: 'Все отступы одинаковые — страница выглядит как таблица без группировки.' })
  } else if (a.spacingValues > 8) {
    out.push({
      kind: 'rhythm',
      text: `Отступов ${a.spacingValues} разных значений (${a.spacingList.join(', ')}) — шкалы нет, расстояния случайные.`,
    })
  }
  if (a.overflowPx > 2) {
    out.push({ kind: 'overflow', text: `Содержимое шире окна на ${a.overflowPx}px — появляется горизонтальная прокрутка.` })
  }
  if (a.widestMeasure > 95) {
    out.push({
      kind: 'measure',
      text: `В строке помещается около ${a.widestMeasure} символов при удобных 60–90 — глаз теряет строку при переносе.`,
    })
  }
  if (a.tinyTargets > 0) {
    out.push({ kind: 'target', text: `Кликабельных зон ниже 32px: ${a.tinyTargets}. По ним трудно попасть.` })
  }
  if (a.stretched) {
    out.push({ kind: 'density', text: 'Содержимое тянется на всю ширину окна — ни одного ограничения по ширине.' })
  }

  return out
}

/** Снимает мерки со страницы, открытой в переданном webContents. */
export async function auditLayout(contents: WebContents): Promise<LayoutReport> {
  const raw = (await contents.executeJavaScript(AUDIT_JS).catch(() => null)) as RawAudit | null
  if (!raw) return EMPTY_LAYOUT
  return {
    findings: toFindings(raw),
    metrics: {
      worstContrast: raw.worstContrast,
      typeScale: raw.typeScale,
      spacingValues: raw.spacingValues,
      overflowPx: raw.overflowPx,
    },
  }
}

/** Короткая сводка для журнала и промпта. */
export function describeLayout(report: LayoutReport): string {
  if (report.findings.length === 0) return 'Замечаний по вёрстке нет.'
  return report.findings.map((f) => `  - ${f.text}`).join('\n')
}
