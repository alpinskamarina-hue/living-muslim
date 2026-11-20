// Which model answers. Haiku 5.5 is about 20 times cheaper than Sonnet 5.5 and is enough for «how do I…»
// questions and simple actions (log food, mark a prayer, set a reminder). Sonnet 5.5 answers questions about
// faith and learning, long questions, and anything the person asks to explain in depth.
export const HAIKU = 'claude-haiku-5-5';
export const SONNET = 'claude-sonnet-5-5';

const DEEP = [
  // faith and learning
  /коран|аят|сур[аеуы]\b|тафсир|хадис|сунн[аы]|фикх|мазхаб|шариат|фетв|харам|халял|макрух|грех|тавб|акыд|иман\b|сир[аы]\b|пророк|сахаб|арабск|грамматик|таджвид|умр[аеуы]|хадж|ихрам|закят|никах|развод|наследств|молитв[аы] как|как правильно|можно ли|допустимо ли|обязательно ли|разреш[её]н/i,
  /quran|qur'an|ayah|surah|tafsir|hadith|sunnah|fiqh|madh?hab|shariah|fatwa|haram|halal|makruh|\bsin\b|tawbah|aqeedah|prophet|sahab|arabic|grammar|tajweed|umrah|hajj|ihram|zakat|nikah|divorce|inheritance|is it allowed|is it permissible/i,
  // depth asked for
  /объясни|расскажи подробн|разбер[иё]|почему|в ч[её]м смысл|сравни|составь план|напиши (текст|письмо|речь)|explain|in detail|why\b|compare|write (a|an|me)/i,
];

/** The last thing the person typed (tool rounds keep the model of the question that started them). */
function lastText(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

export function pickModel(msgs) {
  const t = lastText(msgs);
  if (t.length > 400) return SONNET;
  if (DEEP.some((re) => re.test(t))) return SONNET;
  return HAIKU;
}

/** One line per answer in the Vercel logs, to check cache hits and cost: no text of the conversation. */
export function logUsage(where, model, u) {
  if (!u) return;
  console.log(`[ai] ${where} ${model} in=${u.input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens ?? 0}`);
}
