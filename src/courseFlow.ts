// A video playlist as a real course: modules, mini-tests, a final test and a certificate.
// The content (summaries, practice, questions) comes from the owner's plan; without one a course is just its lessons.
import type { CoursePlan, Lesson, LessonPlan, QuizQ, VideoItem, VideoState } from './videos';

export const PASS = 70;

/** The plan people see. Faith courses show summaries and tests only after an imam checked them. */
export function planOf(item: VideoItem): CoursePlan | undefined {
  const p = item.plan;
  if (!p) return undefined;
  if (item.cat === 'faith' && !p.checked) return undefined;
  return p;
}

export const lessonPlan = (item: VideoItem, vid: string): LessonPlan | undefined => planOf(item)?.lessons?.[vid];

export interface ModuleView {
  i: number;
  title: string;
  from: number; // first lesson index
  to: number;   // after the last lesson index
  quiz?: QuizQ[];
  done: number;
  allDone: boolean;
  score?: number;
  passed: boolean;
}

/** Modules over the playlist's lessons. Lessons the plan does not cover go to the last module. */
export function modulesOf(item: VideoItem, items: Lesson[], vs: VideoState): ModuleView[] {
  const mods = planOf(item)?.modules ?? [];
  const out: ModuleView[] = [];
  let at = 0;
  const parts: { title: string; n: number; quiz?: QuizQ[] }[] = mods.some((m) => m.n > 0) ? mods : [{ title: '', n: items.length }];
  const lastI = parts.map((m) => m.n > 0).lastIndexOf(true);
  parts.forEach((m, i) => {
    // The index stays the module's place in the plan, so saved test scores keep pointing at it.
    if (at >= items.length || m.n <= 0) return;
    const last = i === lastI;
    const to = last ? items.length : Math.min(items.length, at + m.n);
    const quiz = m.quiz?.filter(okQ);
    const done = items.slice(at, to).filter((x) => vs.pos[x.id]?.done).length;
    const score = vs.quiz?.[`${item.id}:${i}`];
    out.push({ i, title: m.title, from: at, to, quiz: quiz?.length ? quiz : undefined, done, allDone: done === to - at, score, passed: !quiz?.length || (score ?? 0) >= PASS });
    at = to;
  });
  return out;
}

export const okQ = (q: QuizQ) => Boolean(q.q?.trim() && q.opts?.filter((o) => o.trim()).length >= 2 && q.opts[q.a]?.trim());
export const finalOf = (item: VideoItem) => planOf(item)?.final?.filter(okQ) ?? [];

export interface CourseView {
  mods: ModuleView[];
  done: number;
  total: number;
  final: QuizQ[];
  finalScore?: number;
  finalReady: boolean;
  complete: boolean;
  /** Tests count toward the progress bar like lessons. */
  pct: number;
  next: { kind: 'lesson'; idx: number } | { kind: 'quiz'; m: number } | { kind: 'final' } | { kind: 'cert' };
}

export function courseView(item: VideoItem, items: Lesson[], vs: VideoState): CourseView {
  const mods = modulesOf(item, items, vs);
  const done = items.filter((x) => vs.pos[x.id]?.done).length;
  const final = finalOf(item);
  const finalScore = vs.quiz?.[`${item.id}:f`];
  const allLessons = items.length > 0 && done === items.length;
  const finalReady = allLessons && mods.every((m) => m.passed);
  const complete = finalReady && (!final.length || (finalScore ?? 0) >= PASS);
  const tests = mods.filter((m) => m.quiz).length + (final.length ? 1 : 0);
  const testsOk = mods.filter((m) => m.quiz && m.passed).length + (final.length && (finalScore ?? 0) >= PASS ? 1 : 0);
  const pct = items.length ? Math.round(((done + testsOk) / (items.length + tests)) * 100) : 0;
  let next: CourseView['next'] = { kind: 'cert' };
  const pendingQuiz = mods.find((m) => m.quiz && m.allDone && !m.passed);
  const firstOpen = items.findIndex((x) => !vs.pos[x.id]?.done);
  // A module's test comes right after its last lesson, before the next module starts.
  if (pendingQuiz && (firstOpen < 0 || firstOpen >= pendingQuiz.to)) next = { kind: 'quiz', m: pendingQuiz.i };
  else if (firstOpen >= 0) next = { kind: 'lesson', idx: firstOpen };
  else if (final.length && !complete) next = { kind: 'final' };
  return { mods, done, total: items.length, final, finalScore, finalReady, complete, pct, next };
}

/** The module a lesson belongs to. */
export const moduleAt = (mods: ModuleView[], idx: number) => mods.find((m) => idx >= m.from && idx < m.to);

export const courseLink = (id: string, by?: string) => `${location.origin}/app/?course=${encodeURIComponent(id)}${by ? `&by=${encodeURIComponent(by)}` : ''}`;
