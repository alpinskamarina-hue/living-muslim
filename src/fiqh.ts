// Common questions about the fast. Mainstream positions, with the Hanafi and Shafi'i view where they differ.
// Kept short on purpose: for a personal case the answer is always "ask your imam".
type T2 = [string, string];
export interface FiqhQ { q: T2; a: T2; hanafi?: T2; shafi?: T2; src?: T2 }

export const FAST_FAQ: FiqhQ[] = [
  {
    q: ['Забыл и поел или попил. Пост испорчен?', 'I forgot and ate or drank. Is my fast broken?'],
    a: ['Нет. Как только вспомнил, перестань и продолжай пост. Возмещать не нужно.', 'No. Stop as soon as you remember and carry on fasting. Nothing to make up.'],
    src: ['«Кто забыл, что постится, и поел или попил, пусть завершит свой пост: его накормил и напоил Аллах». аль-Бухари, 1933; Муслим, 1155', '"Whoever forgets they are fasting and eats or drinks, let them complete their fast, for Allah fed them and gave them drink." al-Bukhari, 1933; Muslim, 1155'],
  },
  {
    q: ['Что нарушает пост?', 'What breaks the fast?'],
    a: ['Намеренные еда, питьё и курение; интимная близость днём; намеренно вызванная рвота; начало месячных или послеродового кровотечения. Пропущенный по этим причинам день возмещают.', 'Deliberate eating, drinking or smoking; intimacy during the day; deliberately induced vomiting; the start of a period or post-natal bleeding. A day lost this way is made up.'],
  },
  {
    q: ['Что пост не нарушает?', 'What does not break the fast?'],
    a: ['Чистка зубов и мисвак, полоскание рта без глотания, душ и купание, случайная рвота, сон и поллюция во сне, анализ крови. Капли в глаза и уколы, которые не питают, по мнению многих учёных тоже не нарушают. Пасту и воду не глотай.', 'Brushing teeth and miswak, rinsing the mouth without swallowing, a shower or bath, unintended vomiting, sleep and a wet dream, a blood test. Many scholars hold that eye drops and non-nutritive injections do not break it either. Do not swallow toothpaste or water.'],
  },
  {
    q: ['Проспал сухур. Можно поститься?', 'I slept through suhoor. Can I still fast?'],
    a: ['Да. Сухур — сунна, а не условие поста. Главное — намерение поститься.', 'Yes. Suhoor is a sunnah, not a condition of the fast. What matters is the intention to fast.'],
    hanafi: ['У ханафитов намерение на пост Рамадана можно сделать и утром, до середины дня.', 'For Hanafis, the intention for a Ramadan fast can also be made in the morning, before midday.'],
    shafi: ['У шафиитов намерение на обязательный пост делают ночью, до рассвета. Можно один раз вечером на завтра.', 'For Shafi‘is, the intention for an obligatory fast is made at night, before dawn. Once in the evening for the next day is enough.'],
  },
  {
    q: ['Я в пути. Нужно поститься?', 'I am travelling. Do I have to fast?'],
    a: ['Путник может не поститься и возместить потом (Коран, 2:184). Если поститься в пути легко, можно и поститься.', 'A traveller may skip the fast and make it up later (Quran 2:184). If fasting on the journey is easy, fasting is fine too.'],
  },
  {
    q: ['Беременность и кормление грудью', 'Pregnancy and breastfeeding'],
    a: ['Если есть страх за себя или за ребёнка, можно не поститься и возместить дни позже.', 'If there is fear for yourself or for the baby, you may skip the fast and make the days up later.'],
    hanafi: ['У ханафитов только возмещение, фидья не нужна.', 'For Hanafis, only making up; no fidyah.'],
    shafi: ['У шафиитов, если не постилась только из страха за ребёнка, кроме возмещения дают ещё и фидью за каждый день.', 'For Shafi‘is, if you skipped only out of fear for the baby, you also give fidyah for each day besides making it up.'],
  },
  {
    q: ['Месячные в Рамадан', 'Periods in Ramadan'],
    a: ['Во время месячных не постятся. Пропущенные дни поста возмещают, а намазы нет.', 'One does not fast during a period. The missed fasts are made up, the prayers are not.'],
    src: ['Аиша: «Нам велели возмещать пост и не велели возмещать намаз». Муслим, 335', '‘A’ishah: "We were told to make up the fasts and not told to make up the prayers." Muslim, 335'],
  },
  {
    q: ['Что такое каффара?', 'What is kaffarah?'],
    a: ['Искупление за намеренную интимную близость днём в Рамадан: 60 дней поста подряд, а если это не по силам, накормить 60 бедных. И ещё возместить сам день.', 'Expiation for deliberate intimacy during a Ramadan day: fasting 60 days in a row, or if that is beyond you, feeding 60 poor people. The day itself is also made up.'],
    hanafi: ['У ханафитов каффара и за намеренную еду или питьё днём в Рамадан без причины.', 'For Hanafis, kaffarah is also due for deliberately eating or drinking during a Ramadan day without excuse.'],
    shafi: ['У шафиитов каффара только за близость; за намеренную еду возмещают день и каются.', 'For Shafi‘is, kaffarah is only for intimacy; for deliberate eating one makes up the day and repents.'],
    src: ['аль-Бухари, 1936; Муслим, 1111', 'al-Bukhari, 1936; Muslim, 1111'],
  },
  {
    q: ['Кто платит фидью?', 'Who gives fidyah?'],
    a: ['Тот, кто не может поститься и не сможет возместить: старость или болезнь без надежды на выздоровление. За каждый день кормят одного бедного (Коран, 2:184).', 'Someone who cannot fast and will not be able to make it up: old age or an illness with no hope of recovery. For each day, one poor person is fed (Quran 2:184).'],
    hanafi: ['У ханафитов размер как у закят аль-фитр за одного человека.', 'For Hanafis, the amount equals zakat al-fitr for one person.'],
    shafi: ['У шафиитов это мудд основной еды, около 0,6 кг, за день. Кто без причины отложил возмещение до следующего Рамадана, тоже даёт мудд за каждый день.', 'For Shafi‘is, one mudd of staple food, about 0.6 kg, per day. Whoever delays making up past the next Ramadan without excuse also gives a mudd for each day.'],
  },
];
