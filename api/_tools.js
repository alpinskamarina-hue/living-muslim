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
    name: 'add_plan',
    description: 'Add a plan to «Планы» (Profile → Планы, also on Today): something to do on a day. Use for tasks and errands with a day: «завтра забронировать отель», «в понедельник написать Ибрагиму», «на неделе купить подарок». For a bare «напомни» with no task to tick off, use set_reminder instead. Several tasks = several calls.',
    input_schema: { type: 'object', properties: {
      text: { type: 'string', description: 'The task, short, in the person\'s words.' },
      date: { type: 'string', description: 'Day YYYY-MM-DD (local). For «на неделе» any day of that week.' },
      this_week: { type: 'boolean', description: 'True for «на неделе» / «this week» with no fixed day.' },
      time: { type: 'string', description: 'Local time HH:MM, if the person gave one.' },
      after_prayer: { type: 'string', enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'], description: 'When the task is tied to a prayer («после Зухра»). jumuah only on a Friday.' },
      remind: { type: 'string', enum: ['none', 'at', 'hour_before'], description: '«at» rings at the time (or 30 min after the prayer, 60 after Jumuah). Default: at, when there is a time or prayer and the person asked to be reminded or it is an appointment; none otherwise.' },
      list: { type: 'string', description: 'Optional list: one of the person\'s lists from person_data (Работа, Семья, Дин, Умра…) when it clearly fits.' },
      repeat: { type: 'string', enum: ['none', 'day', 'week', 'month'] },
      note: { type: 'string', description: 'Details: phone, link, address.' },
    }, required: ['text', 'date'] },
  },
  {
    name: 'update_plan',
    description: 'Change a plan by id: mark done or not done for a day, move it to another day, change text or time, or delete it (only when asked).',
    input_schema: { type: 'object', properties: {
      plan_id: { type: 'string' },
      action: { type: 'string', enum: ['done', 'undone', 'move', 'edit', 'delete'] },
      date: { type: 'string', description: 'For done/undone: which day (default today). For move: the new day.' },
      text: { type: 'string' }, time: { type: 'string' },
      after_prayer: { type: 'string', enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
      remind: { type: 'string', enum: ['none', 'at', 'hour_before'] },
    }, required: ['plan_id', 'action'] },
  },
  {
    name: 'draft_message',
    description: 'Show a ready text of a message the person wants to send someone (WhatsApp, Telegram, SMS, email). The phone shows it with «Скопировать» and «Отправить в WhatsApp» buttons; the person sends it themselves. Write the text in the language and tone the person would use with that recipient.',
    input_schema: { type: 'object', properties: { to: { type: 'string', description: 'Who it is for, e.g. «Ибрагиму».' }, text: { type: 'string' } }, required: ['text'] },
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
    name: 'log_health',
    description: 'Health (Практика → Здоровье): sleep («лёг в 1:00, встал в 7:00»), a workout, a sunnah fast day, the daily water goal, or body weight. Sleep is saved for the morning day (date = the day they woke up, default today).',
    input_schema: { type: 'object', properties: {
      what: { type: 'string', enum: ['sleep', 'workout', 'fast', 'no_fast', 'water_goal', 'weight'] },
      bed: { type: 'string', description: 'Sleep: went to bed, HH:MM.' }, wake: { type: 'string', description: 'Sleep: woke up, HH:MM.' },
      quality: { type: 'string', enum: ['good', 'ok', 'bad'] },
      workout_id: { type: 'string', enum: ['morning', 'back', 'strength'], description: 'One of the app workouts, if it matches; otherwise workout_name.' },
      workout_name: { type: 'string', description: 'Own workout, e.g. «Бег 5 км», «Футбол».' },
      glasses: { type: 'integer', description: 'water_goal: glasses per day.' },
      weight_kg: { type: 'number' }, date: DATE,
    }, required: ['what'] },
  },
  {
    name: 'log_food',
    description: 'Write what the person ate into Питание (calorie log), with your best estimate per portion. «Съел плов 300 г и салат» = two items. If no grams were said, assume a usual portion and say so.',
    input_schema: { type: 'object', properties: {
      items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' }, protein: { type: 'number' }, fat: { type: 'number' }, carbs: { type: 'number' } }, required: ['name', 'grams', 'kcal'] } },
      meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'], description: 'In Ramadan breakfast = suhoor, dinner = iftar. Leave out to pick by the time of day.' },
      portion: { type: 'string', enum: ['light', 'normal', 'overate'], description: 'Only if the person said how much (ate lightly, overate).' },
      date: DATE,
    }, required: ['items'] },
  },
  {
    name: 'rate_meal',
    description: 'Mark a meal in Питание by measure only, without calories: light, normal, overate, or clear.',
    input_schema: { type: 'object', properties: { meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] }, portion: { type: 'string', enum: ['light', 'normal', 'overate', 'clear'] }, date: DATE }, required: ['meal', 'portion'] },
  },
  {
    name: 'mark_azkar',
    description: 'Mark the morning or evening adhkar as read (done=false to clear).',
    input_schema: { type: 'object', properties: { part: { type: 'string', enum: ['morning', 'evening'] }, done: { type: 'boolean' }, date: DATE }, required: ['part'] },
  },
  {
    name: 'set_quran_place',
    description: 'Move the Quran bookmark (where the reader opens) to a surah and ayah, e.g. «я дочитал до 2:255» → surah 2, ayah 256 (the next one to read).',
    input_schema: { type: 'object', properties: { surah: { type: 'integer' }, ayah: { type: 'integer' } }, required: ['surah', 'ayah'] },
  },
  {
    name: 'set_book_page',
    description: 'Set the current page of a book on the shelf in Книги (book id from person_data), e.g. «я на 120 странице».',
    input_schema: { type: 'object', properties: { book_id: { type: 'string' }, page: { type: 'integer' } }, required: ['book_id', 'page'] },
  },
  {
    name: 'ramadan',
    description: 'Ramadan log: a fast day (status fast, or a reason for not fasting), clear a fast mark, a night prayer (tarawih, tahajjud, itikaf, on the evening\'s day), or a made-up (qada) fast today.',
    input_schema: { type: 'object', properties: {
      what: { type: 'string', enum: ['fast', 'clear_fast', 'night', 'qada'] },
      status: { type: 'string', enum: ['fast', 'ill', 'travel', 'period', 'other', 'chronic'] },
      night: { type: 'string', enum: ['tarawih', 'tahajjud', 'itikaf'] }, date: DATE,
    }, required: ['what'] },
  },
  {
    name: 'quit_log',
    description: '«Хочу оставить» (bad habits the person is leaving, by id from person_data): urge = felt the pull but held on; held = a whole day without it; slip = it happened (with optional causes). Be gentle, no blame; after a slip remind that tawba is open.',
    input_schema: { type: 'object', properties: { quit_id: { type: 'string' }, kind: { type: 'string', enum: ['urge', 'held', 'slip'] }, causes: { type: 'array', items: { type: 'string' } }, date: DATE }, required: ['quit_id', 'kind'] },
  },
  {
    name: 'umrah',
    description: 'Umrah: add a dua to the list to make there (optionally for whom), or set the tawaf / sa\'i round counter (0–7).',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['add_dua', 'tawaf', 'saee'] }, text: { type: 'string' }, for_whom: { type: 'string' }, count: { type: 'integer' } }, required: ['action'] },
  },
  {
    name: 'kid_task',
    description: 'Family: tick (or untick with done=false) a child\'s task for the day, by kid id and task id from person_data.',
    input_schema: { type: 'object', properties: { kid_id: { type: 'string' }, task_id: { type: 'string' }, done: { type: 'boolean' }, date: DATE }, required: ['kid_id', 'task_id'] },
  },
  {
    name: 'change_setting',
    description: 'Change app settings: theme (prayer = dark from Maghrib to Fajr), text size, how many Islamic phrases (normal, calm, phrases only), brother/sister form, name in the app, madhab for Asr, or a minutes correction to one prayer time to match the local mosque. Language, city and notifications the person changes in Профиль (open the screen).',
    input_schema: { type: 'object', properties: {
      theme: { type: 'string', enum: ['prayer', 'auto', 'light', 'dark'] }, text_size: { type: 'string', enum: ['normal', 'large', 'larger'] },
      words: { type: 'string', enum: ['normal', 'calm', 'phrases'] }, me: { type: 'string', enum: ['brother', 'sister'] }, name: { type: 'string' },
      madhab: { type: 'string', enum: ['shafi', 'hanafi'] }, offset_prayer: PRAYER, offset_minutes: { type: 'integer', description: '-60..60, the full correction for that prayer.' },
    } },
  },
  {
    name: 'open_screen',
    description: 'Open a screen of the app for the person (the chat closes). Use only when they ask to open or go somewhere, as the last action.',
    input_schema: { type: 'object', properties: { screen: { type: 'string', enum: ['today', 'circle', 'goals', 'profile', 'quran', 'tasbih', 'focus', 'books', 'courses', 'languages', 'health', 'food', 'sadaqa', 'umrah', 'ramadan', 'safar', 'add_habit', 'reminders', 'prayer_settings', 'my_habits', 'garden', 'account', 'ideas', 'my_reminders', 'plans', 'azkar', 'tests'] } }, required: ['screen'] },
  },
];

export const TOOLS_PROMPT = `You can act in the app with the tools: add or change habits, mark habits and prayers, create and update goals (also «read this book» goals for books on the shelf), add and tick goal steps, write goal notes, add, tick off, move and delete plans («Планы»: tasks for a day, between the prayers), draft a message for someone, save ideas, set and cancel reminders, mark sadaqa, add water, log sleep, workouts, fasts and weight, log food with calories or rate a meal, mark morning/evening adhkar, move the Quran bookmark, set a book page, keep the Ramadan log, log urges/slips in «Хочу оставить», add umrah duas and count tawaf/sa'i, tick children's tasks, change settings, open a screen. If something in the app can be done by hand, you can do it too; never say you have no tool for a thing listed here.
- Do what the person asks right away, without asking for confirmation for ordinary things; every action shows on their phone with an «Отменить» (undo) button.
- Ask a short question only when something essential is missing or ambiguous (which goal or habit, or a prayer for a new habit you cannot sensibly guess).
- Use ids exactly as given in person_data. Never invent ids.
- After acting, confirm in one or two short sentences what you did. Do not repeat the whole list.
- When the person attaches a book file (📎) the phone puts it on the shelf in Книги by itself; you see it in person_data under Books. Offer a reading goal or create it if asked. You cannot read the text of the book.
- A reminder needs a day and either a time or a prayer; if the person gave neither, pick a sensible moment (for example after the next Dhuhr) and say which. If the result says notifications are off, tell them to turn on Профиль → Напоминания so the reminder reaches the phone.
- Plans vs reminders vs ideas: a task to do on a day goes to Планы (add_plan; with a time or prayer and «напомни» it also rings); a bare «напомни» without a task is set_reminder; a thought with no day is save_idea.
- «Что у меня сегодня / на неделе?» — answer from PLANS in person_data. Offer to move undone plans from past days.
- When a plan is to write or call someone, offer to draft the message (draft_message); never claim you sent anything, the person sends it.
- Deleting or stopping something (archive a habit, delete an idea or a plan, cancel a reminder, clear a mark) — first ask «Удалить …? Да / нет» naming exactly what, and act only after the person answers yes. A goal is marked reached only when they say so.
- You cannot and must not: pay or change the tariff, change the email, sign-in or account, delete the account or all data, send anything to other people yourself (only draft_message), see or change other people's data, or touch admin pages. Say plainly that the person does this themselves and offer to open the screen.
- In a circle you only see day totals and dua requests; you do not write in the circle chat.`;

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
