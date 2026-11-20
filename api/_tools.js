// Actions the assistant can take in the app. The server only describes them; the phone carries them out
// on the person's own data (which lives on the phone) and sends back what happened.
const DATE = { type: 'string', description: 'Day as YYYY-MM-DD. Leave out for today.' };
const PRAYER = { type: 'string', enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] };

export const TOOLS = [
  {
    name: 'add_habit',
    description: 'Add a new habit that the person does after one of the five prayers. Use the person\'s language for the texts.',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', description: 'What to do, short, e.g. «Читать Коран 10 минут».' },
      minimum: { type: 'string', description: 'The minimum version for a hard day, e.g. «1 аят».' },
      after_prayer: PRAYER,
      sphere: { type: 'string', enum: ['faith', 'body', 'food', 'mind', 'biz', 'family'] },
    }, required: ['action', 'minimum', 'after_prayer'] },
  },
  {
    name: 'edit_habit',
    description: 'Change an existing habit (by its id from person_data): its text, minimum or prayer.',
    input_schema: { type: 'object', properties: { habit_id: { type: 'string' }, action: { type: 'string' }, minimum: { type: 'string' }, after_prayer: PRAYER }, required: ['habit_id'] },
  },
  {
    name: 'archive_habit',
    description: 'Stop a habit (move it to the archive). Only when the person clearly asks to remove or stop it.',
    input_schema: { type: 'object', properties: { habit_id: { type: 'string' } }, required: ['habit_id'] },
  },
  {
    name: 'mark_habit',
    description: 'Mark a habit as done, done in its minimum version, or clear the mark.',
    input_schema: { type: 'object', properties: { habit_id: { type: 'string' }, mark: { type: 'string', enum: ['done', 'minimum', 'clear'] }, date: DATE }, required: ['habit_id', 'mark'] },
  },
  {
    name: 'mark_prayer',
    description: 'Mark one of the five prayers as prayed on time or late, or clear the mark.',
    input_schema: { type: 'object', properties: { prayer: PRAYER, status: { type: 'string', enum: ['on_time', 'late', 'clear'] }, date: DATE }, required: ['prayer', 'status'] },
  },
  {
    name: 'create_goal',
    description: 'Create a goal the person tracks by steps (any life goal: learn something, move, a trip, a project). Steps are optional and can be added later.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' },
      niyya: { type: 'string', description: 'Intention, why this goal, if the person said it.' },
      identity: { type: 'string', description: '«Я тот, кто…» if the person said it.' },
      due: { type: 'string', description: 'Deadline YYYY-MM-DD, if any.' },
      steps: { type: 'array', items: { type: 'string' } },
      habit_ids: { type: 'array', items: { type: 'string' }, description: 'Existing habits that serve this goal.' },
    }, required: ['title'] },
  },
  {
    name: 'create_book_goal',
    description: 'Create a goal «read this book» for a book on the shelf in Книги (by book id). Progress is counted by the pages the person reads in the app reader.',
    input_schema: { type: 'object', properties: { book_id: { type: 'string' }, due: { type: 'string', description: 'Deadline YYYY-MM-DD, if any.' }, niyya: { type: 'string' } }, required: ['book_id'] },
  },
  {
    name: 'update_goal',
    description: 'Change a goal (by id): title, deadline, niyya, or status (active, later = postponed, done = reached).',
    input_schema: { type: 'object', properties: { goal_id: { type: 'string' }, title: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD, or "none" to remove the deadline.' }, niyya: { type: 'string' }, status: { type: 'string', enum: ['active', 'later', 'done'] } }, required: ['goal_id'] },
  },
  {
    name: 'add_goal_steps',
    description: 'Add steps to a goal that is tracked by steps.',
    input_schema: { type: 'object', properties: { goal_id: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } }, required: ['goal_id', 'steps'] },
  },
  {
    name: 'tick_goal_step',
    description: 'Mark a goal step as done (or not done again with done=false).',
    input_schema: { type: 'object', properties: { goal_id: { type: 'string' }, step_id: { type: 'string' }, done: { type: 'boolean' } }, required: ['goal_id', 'step_id'] },
  },
  {
    name: 'add_goal_note',
    description: 'Write a dated note into a goal\'s journal: what was done or thought about this goal.',
    input_schema: { type: 'object', properties: { goal_id: { type: 'string' }, text: { type: 'string' } }, required: ['goal_id', 'text'] },
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder: a notification on the phone at a time, or a number of minutes after a prayer on a given day (after Jumuah = after Dhuhr on Friday). Use it whenever the person says «напомни», «remind me», or asks not to forget something at a certain moment.',
    input_schema: { type: 'object', properties: {
      text: { type: 'string', description: 'What to remind about, short, in the person\'s words, as it should appear in the notification.' },
      date: { type: 'string', description: 'Day YYYY-MM-DD in the person\'s local calendar (see Today in person_data).' },
      time: { type: 'string', description: 'Local time HH:MM. Leave out when tied to a prayer.' },
      after_prayer: { type: 'string', enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
      minutes_after: { type: 'number', description: 'Minutes after that prayer begins; default 30 (for Jumuah 60).' },
    }, required: ['text', 'date'] },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a reminder by id.',
    input_schema: { type: 'object', properties: { reminder_id: { type: 'string' } }, required: ['reminder_id'] },
  },
  {
    name: 'save_idea',
    description: 'Save an idea, thought or reminder to the person\'s «Мои идеи» list (Profile → Мои идеи). Use when they want to write something down that is not a goal note.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'delete_idea',
    description: 'Delete an idea from «Мои идеи» by its id.',
    input_schema: { type: 'object', properties: { idea_id: { type: 'string' } }, required: ['idea_id'] },
  },
  {
    name: 'mark_sadaqa',
    description: 'Mark sadaqa for a day: given money (with an optional amount) or a good deed.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['money', 'deed'] }, amount: { type: 'number' }, date: DATE }, required: ['kind'] },
  },
  {
    name: 'add_water',
    description: 'Add glasses of water drunk today (can be negative to correct).',
    input_schema: { type: 'object', properties: { glasses: { type: 'integer' } }, required: ['glasses'] },
  },
  {
    name: 'open_screen',
    description: 'Open a screen of the app for the person (the chat closes). Use only when they ask to open or go somewhere, as the last action.',
    input_schema: { type: 'object', properties: { screen: { type: 'string', enum: ['today', 'circle', 'goals', 'profile', 'quran', 'tasbih', 'focus', 'books', 'courses', 'languages', 'health', 'food', 'sadaqa', 'umrah', 'ramadan', 'safar', 'add_habit', 'reminders', 'prayer_settings', 'my_habits', 'garden', 'account', 'ideas', 'my_reminders'] } }, required: ['screen'] },
  },
];

export const TOOLS_PROMPT = `You can act in the app with the tools: add or change habits, mark habits and prayers, create and update goals (also «read this book» goals for books on the shelf), add and tick goal steps, write goal notes, save ideas, set and cancel reminders, mark sadaqa, add water, open a screen.
- Do what the person asks right away, without asking for confirmation for ordinary things; every action shows on their phone with an «Отменить» (undo) button.
- Ask a short question only when something essential is missing or ambiguous (which goal or habit, or a prayer for a new habit you cannot sensibly guess).
- Use ids exactly as given in person_data. Never invent ids.
- After acting, confirm in one or two short sentences what you did. Do not repeat the whole list.
- When the person attaches a book file (📎) the phone puts it on the shelf in Книги by itself; you see it in person_data under Books. Offer a reading goal or create it if asked. You cannot read the text of the book.
- A reminder needs a day and either a time or a prayer; if the person gave neither, pick a sensible moment (for example after the next Dhuhr) and say which. If the result says notifications are off, tell them to turn on Профиль → Напоминания so the reminder reaches the phone.
- Removing or stopping something (archive a habit, delete an idea, mark a goal reached) only when the person clearly asked.`;

const BLOCKS = new Set(['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking']);
/** Messages from the browser: plain text turns, or block turns of a tool round. */
export function cleanMessages(list, maxTurns, maxChars) {
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(-maxTurns)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content === 'string') { const t = m.content.slice(0, maxChars); if (t.trim()) out.push({ role: m.role, content: t }); continue; }
    if (!Array.isArray(m.content)) continue;
    const blocks = m.content.filter((x) => x && BLOCKS.has(x.type)).slice(0, 20).map((x) => {
      if (x.type === 'text') return { type: 'text', text: String(x.text || '').slice(0, 8000) };
      if (x.type === 'tool_result') return { type: 'tool_result', tool_use_id: String(x.tool_use_id || ''), content: String(x.content || '').slice(0, 2000), ...(x.is_error ? { is_error: true } : {}) };
      return x; // tool_use and thinking blocks go back exactly as the model sent them
    }).filter((x) => x.type !== 'text' || x.text.trim());
    if (blocks.length) out.push({ role: m.role, content: blocks });
  }
  return out;
}
