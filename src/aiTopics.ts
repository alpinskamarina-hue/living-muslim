// What the assistant helps with, for a new person: the six topics on the last onboarding step and in an empty chat,
// and the «Открыть …» button the assistant puts under an answer ([[open:screen]] at its end).
import { _t } from './i18n';
import type { Settings } from './types';

export interface AiTopic { ic: string; title: string; line: string; ask: string }

export function aiTopics(s: Settings): AiTopic[] {
  const f = s.me === 'f';
  return [
    { ic: '🧭', title: _t("Поездка"), line: _t("Намазы в дороге посчитаются сами."), ask: _t("Еду в Стамбул на неделю") },
    { ic: '🕋', title: _t("Умра"), line: _t("Подготовка, группа, гиды."), ask: _t("Хочу на умру весной") },
    { ic: '📚', title: _t("Учёба"), line: _t("Курсы, арабский, книги."), ask: _t("Хочу выучить арабский") },
    { ic: '☪', title: _t("Халяль"), line: _t("Сканер продуктов."), ask: _t("Е471 можно?") },
    { ic: '🗓', title: _t("Дела"), line: _t("Планы между намазами."), ask: _t("Завтра врач в 15:00") },
    { ic: '🤝', title: _t("Люди"), line: _t("Круги, семья, никах."), ask: f ? _t("Хочу найти сестёр рядом") : _t("Хочу найти братьев рядом") },
  ];
}

/** Short chips for the end of onboarding. */
export function aiTopicChips(s: Settings): { label: string; ask: string }[] {
  const f = s.me === 'f';
  return [
    { label: _t("🧭 Еду в поездку"), ask: _t("Еду в поездку. Что мне нужно знать о намазах в дороге?") },
    { label: _t("🕋 Хочу на умру"), ask: _t("Хочу на умру. С чего начать?") },
    { label: _t("📚 Хочу учиться"), ask: _t("Хочу изучать ислам. С чего начать?") },
    { label: _t("☪ Халяль ли продукт?"), ask: _t("Как понять, халяль ли продукт в магазине?") },
    { label: _t("🗓 Мои дела на неделю"), ask: _t("Помоги расписать мои дела на неделю") },
    { label: f ? _t("🤝 Найти сестёр") : _t("🤝 Найти братьев"), ask: f ? _t("Хочу найти сестёр, с кем вместе держаться") : _t("Хочу найти братьев, с кем вместе держаться") },
  ];
}

/** Button labels for the screens the assistant can suggest. */
export function openLabel(screen: string): string | null {
  const L: Record<string, () => string> = {
    today: () => _t("Открыть «Сегодня»"), circle: () => _t("🤝 Открыть Круг"), goals: () => _t("🎯 Открыть Цели"), profile: () => _t("Открыть Профиль"),
    quran: () => _t("📖 Открыть Коран"), tasbih: () => _t("📿 Открыть Тасбих"), focus: () => _t("⏱ Открыть Фокус"), books: () => _t("📚 Открыть Книги"),
    courses: () => _t("🎓 Открыть Курсы"), languages: () => _t("🗣 Открыть Языки"), health: () => _t("💪 Открыть Здоровье"), food: () => _t("🍽 Открыть Питание"),
    sadaqa: () => _t("🤲 Открыть Садаку"), umrah: () => _t("🕋 Открыть Умру"), ramadan: () => _t("🌙 Открыть Рамадан"), safar: () => _t("🧭 Открыть Сафар"),
    add_habit: () => _t("🌱 Добавить привычку"), reminders: () => _t("🔔 Открыть Напоминания"), prayer_settings: () => _t("🕌 Настройки намазов"),
    my_habits: () => _t("🌱 Мои привычки"), garden: () => _t("🌳 Мой сад"), account: () => _t("Открыть Аккаунт"), ideas: () => _t("💡 Мои идеи"),
    my_reminders: () => _t("⏰ Мои напоминания"), plans: () => _t("🗓 Открыть Планы"), azkar: () => _t("🌅 Открыть Азкары"), tests: () => _t("📝 Открыть Тесты"),
    halal: () => _t("☪ Открыть Халяль-сканер"), khutba: () => _t("🎧 Перевод хутбы"), qibla: () => _t("🧭 Открыть Киблу"), mosques: () => _t("🕌 Мечети рядом"),
    quit: () => _t("🌿 Открыть «Хочу оставить»"), nikah: () => _t("💍 Открыть Никах"), adhan: () => _t("🔊 Открыть Азан"), cycle: () => _t("🌸 Открыть «Мой цикл»"),
    sisters: () => _t("🌸 Для сестёр"),
  };
  return L[screen]?.() ?? null;
}

/** «…text\n[[open:safar]]» → the text without the marker, and the screen. */
export function splitOffer(t: string): { text: string; screen?: string } {
  const m = t.match(/\[\[open:([a-z_]+)\]\]\s*$/);
  if (!m) return { text: t.replace(/\[\[open:[a-z_]+\]\]/g, '').trimEnd() };
  return { text: t.slice(0, m.index).trimEnd(), screen: m[1] };
}
