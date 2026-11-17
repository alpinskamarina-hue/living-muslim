// Islamic phrases, ayahs and hadiths that appear at the right moment.
// One library of cards; a small engine picks one card for a moment and keeps it calm:
// one card per action, no repeat of the same text within 7 days, and a daily cap on ayahs and hadiths.
// Russian text may carry gender forms as [male/female], e.g. «выполнил[/а]».

export type Sex = 'm' | 'f' | '';
export type Mode = 'normal' | 'calm' | 'phrases';

export type Trigger =
  // Today
  | 'prayer_ontime' | 'prayer_fajr' | 'prayer_all5' | 'prayer_late' | 'hard_day'
  | 'habit_done' | 'streak' | 'morning' | 'evening' | 'night' | 'friday_am' | 'friday_pm'
  // Practice
  | 'quran_open' | 'quran_juz' | 'tasbih_done' | 'sadaqa_add' | 'sadaqa_open' | 'lesson_done' | 'course_done'
  | 'books_open' | 'langs_open' | 'health_open' | 'workout' | 'food_open' | 'safar_on' | 'umrah_open'
  | 'ramadan_open' | 'fast_monthu' | 'white_days' | 'dhulhijja' | 'arafa' | 'ashura'
  // Circle
  | 'dua_got' | 'dua_sent' | 'masha_sent' | 'nudge_sent' | 'circle_join' | 'khatm_done'
  // Goals
  | 'goal_new' | 'goal_behind' | 'goal_step' | 'goal_done' | 'goal_review' | 'goals_open'
  // Profile
  | 'garden' | 'profile_saved';

export type Kind = 'phrase' | 'ayah' | 'hadith' | 'athar' | 'dua';

export interface Card {
  id: string;
  on: Trigger[];
  kind: Kind;
  /** Short line in big letters (a phrase), optional for ayahs and hadiths. */
  head?: string;
  ru: string;
  en: string;
  ar?: string;
  /** Source: «аль-Бухари, 527», «2:286». */
  src?: string;
  /** Relative weight; 1 by default. */
  w?: number;
}

const P = (id: string, on: Trigger[], head: string, ar: string, ru: string, en: string, w = 1): Card => ({ id, on, kind: 'phrase', head, ar, ru, en, w });
const A = (id: string, on: Trigger[], ru: string, en: string, src: string, ar?: string, w = 1): Card => ({ id, on, kind: 'ayah', ru, en, src, ar, w });
const H = (id: string, on: Trigger[], ru: string, en: string, src: string, w = 1): Card => ({ id, on, kind: 'hadith', ru, en, src, w });
const D = (id: string, on: Trigger[], head: string, ar: string, ru: string, en: string, src: string): Card => ({ id, on, kind: 'dua', head, ar, ru, en, src });

export const CARDS: Card[] = [
  // ───── Today: prayers ─────
  P('p-ontime-1', ['prayer_ontime'], 'Альхамдулиллях!', 'الحمد لله', 'Намаз в своё время.', 'Prayer on time.', 3),
  P('p-ontime-2', ['prayer_ontime'], 'МашаАллах', 'ما شاء الله', 'Ещё один намаз вовремя. Да примет Аллах.', 'One more prayer on time. May Allah accept it.', 2),
  P('p-ontime-3', ['prayer_ontime'], 'Такаббаль Аллаху', 'تقبّل الله', 'Да примет Аллах твой намаз.', 'May Allah accept your prayer.', 2),
  H('h-ontime', ['prayer_ontime'], 'Самое любимое дело у Аллаха — намаз в своё время.', 'The deed most beloved to Allah is prayer at its proper time.', 'аль-Бухари, 527'),
  H('h-wudu', ['prayer_ontime'], 'Кто совершил омовение как следует, у того грехи выходят из тела, даже из-под ногтей.', 'Whoever performs wudu well, his sins leave his body, even from beneath his nails.', 'Муслим, 245'),
  H('h-steps', ['prayer_ontime'], 'Каждый шаг к мечети стирает грех и возвышает на ступень.', 'Every step to the mosque wipes out a sin and raises a degree.', 'Муслим, 666'),
  P('p-fajr', ['prayer_fajr'], 'Альхамдулиллях!', 'الحمد لله', 'Фаджр выполнен. День начат с Аллахом.', 'Fajr is done. The day began with Allah.', 2),
  H('h-fajr', ['prayer_fajr'], 'Кто совершил утреннюю молитву, тот под защитой Аллаха.', 'Whoever prays Fajr is under the protection of Allah.', 'Муслим, 657', 3),
  H('h-fajr-2', ['prayer_fajr'], 'Два ракаата перед Фаджром лучше этого мира и всего, что в нём.', 'The two rak‘ahs before Fajr are better than this world and all it contains.', 'Муслим, 725'),
  P('p-all5', ['prayer_all5'], 'МашаАллах, все пять!', 'ما شاء الله', 'Все пять намазов сегодня. Альхамдулиллях.', 'All five prayers today. Alhamdulillah.', 2),
  H('h-river', ['prayer_all5'], 'Пять намазов подобны реке у двери, в которой человек омывается пять раз в день: останется ли на нём грязь?', 'The five prayers are like a river at your door in which you bathe five times a day: would any dirt remain?', 'аль-Бухари, 528; Муслим, 667', 3),
  P('p-late-1', ['prayer_late'], 'Альхамдулиллях, намаз совершён', 'الحمد لله', 'Завтра, ИншаАллах, в начале времени.', 'Tomorrow, in sha Allah, at the start of its time.', 3),
  P('p-late-2', ['prayer_late'], 'Альхамдулиллях', 'الحمد لله', 'Главное, что намаз выполнен. Следующий ИншаАллах вовремя.', 'The prayer is done. The next one on time, in sha Allah.', 2),
  P('p-hard-1', ['hard_day'], 'Ля хауля ва ля куввата илля биллях', 'لا حول ولا قوة إلا بالله', 'Нет силы и мощи, кроме как у Аллаха. Сделай самое малое.', 'There is no power except with Allah. Do the smallest step.', 2),
  A('a-hard-1', ['hard_day', 'goal_behind'], 'Аллах не возлагает на душу сверх её возможностей.', 'Allah does not burden a soul beyond what it can bear.', '2:286', 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', 3),
  A('a-hard-2', ['hard_day', 'goal_behind'], 'Воистину, за тягостью — облегчение.', 'Indeed, with hardship comes ease.', '94:6', 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', 3),
  A('a-hard-3', ['hard_day'], 'Не теряйте надежды на милость Аллаха.', 'Do not despair of the mercy of Allah.', '39:53', 'لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ'),
  H('h-hard', ['hard_day'], 'Удивительно положение верующего: всё для него благо. Радость — благодарит, беда — терпит, и в этом благо.', 'Amazing is the affair of the believer: all of it is good. In ease he is grateful, in hardship patient, and both are good for him.', 'Муслим, 2999'),

  // ───── Today: habits and streaks ─────
  P('p-habit-1', ['habit_done'], 'Альхамдулиллях', 'الحمد لله', 'Ещё один шаг.', 'One more step.', 3),
  P('p-habit-2', ['habit_done'], 'БаракАллаху фик[/и]', 'بارك الله فيك', 'Ты держишься. Да благословит Аллах.', 'You keep going. May Allah bless you.', 2),
  P('p-habit-3', ['habit_done'], 'МашаАллах', 'ما شاء الله', 'Сделано.', 'Done.', 2),
  P('p-habit-4', ['habit_done'], 'Субхан Аллах', 'سبحان الله', 'Маленькое дело, большая награда.', 'A small deed, a big reward.', 1),
  H('h-streak', ['streak', 'habit_done'], 'Самые любимые дела у Аллаха — самые постоянные, даже если их мало.', 'The most beloved deeds to Allah are the most consistent, even if small.', 'аль-Бухари, 6464; Муслим, 783', 3),
  P('p-streak', ['streak'], 'Аллаху акбар!', 'الله أكبر', 'Серия держится. Да сделает Аллах это постоянным.', 'The streak holds. May Allah make it last.', 2),
  H('h-small', ['habit_done'], 'Не пренебрегай ничем из благого, даже встретить брата с улыбкой.', 'Do not belittle any good deed, even meeting your brother with a cheerful face.', 'Муслим, 2626'),

  // ───── Today: time of day ─────
  D('d-morning', ['morning'], 'Утренний зикр', 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', 'Асбахна ва асбаха-ль-мульку лиллях: мы встретили утро, и всё царство принадлежит Аллаху.', 'We have entered the morning, and the dominion belongs to Allah.', 'Муслим, 2723'),
  H('h-morning', ['morning'], 'О Аллах, благослови мою общину в её утренних делах.', 'O Allah, bless my nation in their early mornings.', 'Абу Давуд, 2606; ат-Тирмизи, 1212'),
  { id: 'at-muhasaba', on: ['evening', 'goal_review'], kind: 'athar', ru: 'Подводите итог своим делам прежде, чем его подведут за вас.', en: 'Take account of yourselves before you are taken to account.', src: 'Умар ибн аль-Хаттаб, у ат-Тирмизи после 2459' },
  D('d-evening', ['evening'], 'Вечерний зикр', 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ', 'Амсайна ва амса-ль-мульку лиллях: мы встретили вечер, и всё царство принадлежит Аллаху.', 'We have entered the evening, and the dominion belongs to Allah.', 'Муслим, 2723'),
  H('h-kursi', ['night'], 'Кто прочитает аятуль-Курси перед сном, к тому приставлен хранитель от Аллаха до утра.', 'Whoever recites Ayat al-Kursi before sleep has a guardian from Allah until morning.', 'аль-Бухари, 2311'),
  D('d-sleep', ['night'], 'Перед сном', 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا', 'Бисмика Аллахумма амуту ва ахйа: с Твоим именем, о Аллах, я умираю и оживаю. Ложись на правый бок.', 'In Your name, O Allah, I die and I live. Lie on your right side.', 'аль-Бухари, 6312'),
  H('h-kahf', ['friday_am'], 'Кто прочитает суру аль-Кахф в пятницу, тому будет свет между двумя пятницами.', 'Whoever reads Surat al-Kahf on Friday will have light between the two Fridays.', 'аль-Хаким, аль-Байхаки; сахих по аль-Албани', 3),
  H('h-salawat', ['friday_am', 'friday_pm'], 'Чаще благословляйте меня в пятницу: ваши благословения показываются мне.', 'Send abundant blessings upon me on Friday, for your blessings are shown to me.', 'Абу Давуд, 1047', 2),
  H('h-friday-hour', ['friday_pm'], 'В пятнице есть час: если мусульманин попросит в нём Аллаха о благе, Он даст ему.', 'On Friday there is an hour in which a Muslim asks Allah for good, and He gives it.', 'аль-Бухари, 935', 3),

  // ───── Practice: Quran ─────
  H('h-quran-1', ['quran_open'], 'Читайте Коран: в Судный день он придёт заступником за своих людей.', 'Read the Quran, for it will come as an intercessor for its people on the Day of Resurrection.', 'Муслим, 804', 3),
  H('h-quran-2', ['quran_open'], 'За каждую букву из Книги Аллаха — благое дело, а благое дело умножается десятикратно.', 'For every letter of the Book of Allah there is a good deed, multiplied tenfold.', 'ат-Тирмизи, 2910', 3),
  H('h-quran-3', ['quran_open'], 'Тому, кто читает с запинками и трудом, двойная награда.', 'The one who recites with difficulty, stammering, has a double reward.', 'аль-Бухари, 4937; Муслим, 798', 2),
  H('h-quran-4', ['quran_open'], 'Лучший из вас тот, кто изучает Коран и обучает ему.', 'The best of you are those who learn the Quran and teach it.', 'аль-Бухари, 5027', 2),
  A('a-quran-1', ['quran_open'], 'Мы облегчили Коран для поминания. Есть ли поминающий?', 'We have made the Quran easy to remember. Is there anyone who will remember?', '54:17', 'وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ'),
  P('p-juz', ['quran_juz'], 'Аллаху акбар!', 'الله أكبر', 'Джуз завершён. Да сделает Аллах Коран весной твоего сердца.', 'A juz completed. May Allah make the Quran the spring of your heart.'),
  P('p-khatm', ['khatm_done'], 'Аллаху акбар! Хатм', 'الله أكبر', 'Хатм завершён. Джазакумуллаху хайран всем.', 'Khatm completed. May Allah reward you all.'),

  // ───── Practice: tasbih ─────
  H('h-tasbih-1', ['tasbih_done'], 'Два слова лёгкие на языке, тяжёлые на весах: СубханАллахи ва бихамдихи, СубханАллахи-ль-Азым.', 'Two words light on the tongue, heavy on the scale: SubhanAllahi wa bihamdihi, SubhanAllahil-Azim.', 'аль-Бухари, 6682', 2),
  H('h-tasbih-2', ['tasbih_done'], 'Кто после намаза скажет 33 раза СубханАллах, Альхамдулиллях и Аллаху акбар и закончит «Ля иляха илляЛлах…», тому прощены грехи, даже если их как морской пены.', 'Whoever after prayer says SubhanAllah, Alhamdulillah and Allahu Akbar 33 times each and completes with La ilaha illallah… is forgiven, even if his sins were like sea foam.', 'Муслим, 597', 3),
  P('p-tasbih', ['tasbih_done'], 'СубханАллах', 'سبحان الله', 'Тасбих завершён. Да примет Аллах.', 'Tasbih completed. May Allah accept it.'),

  // ───── Practice: sadaqa ─────
  H('h-sadaqa-1', ['sadaqa_add', 'sadaqa_open'], 'Садака не уменьшает имущества.', 'Charity does not decrease wealth.', 'Муслим, 2588', 3),
  H('h-sadaqa-2', ['sadaqa_add'], 'Улыбка брату — садака.', 'Your smile to your brother is charity.', 'ат-Тирмизи, 1956', 2),
  H('h-sadaqa-3', ['sadaqa_open'], 'В тени Аллаха будет тот, кто давал садаку так, что левая рука не знала, что дала правая.', 'In the shade of Allah will be one who gave charity so secretly that his left hand did not know what his right gave.', 'аль-Бухари, 660'),
  H('h-sadaqa-4', ['sadaqa_open'], 'Когда человек умирает, его дела прекращаются, кроме трёх: длящейся садаки, полезного знания и праведного ребёнка, который делает за него дуа.', 'When a person dies, his deeds end except three: ongoing charity, beneficial knowledge, or a righteous child who prays for him.', 'Муслим, 1631'),
  A('a-sadaqa', ['sadaqa_open', 'sadaqa_add'], 'Вы не достигнете благочестия, пока не будете расходовать из того, что любите.', 'You will not attain righteousness until you spend from what you love.', '3:92', 'لَن تَنَالُوا الْبِرَّ حَتَّىٰ تُنفِقُوا مِمَّا تُحِبُّونَ'),
  P('p-sadaqa', ['sadaqa_add'], 'БаракАллаху фик[/и]', 'بارك الله فيك', 'Да примет Аллах твою садаку и умножит.', 'May Allah accept your charity and multiply it.', 2),

  // ───── Practice: learning ─────
  H('h-ilm-1', ['lesson_done', 'books_open'], 'Кто встал на путь знания, тому Аллах облегчит путь в Рай.', 'Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise.', 'Муслим, 2699', 3),
  A('a-ilm-1', ['lesson_done', 'course_done'], 'Господи, прибавь мне знания.', 'My Lord, increase me in knowledge.', '20:114', 'رَّبِّ زِدْنِي عِلْمًا', 2),
  P('p-lesson', ['lesson_done'], 'БаракАллаху фик[/и]', 'بارك الله فيك', 'Урок пройден. Да сделает Аллах знание полезным.', 'Lesson done. May Allah make the knowledge beneficial.', 2),
  P('p-course', ['course_done'], 'Аллаху акбар!', 'الله أكبر', 'Курс пройден. Альхамдулиллях.', 'Course completed. Alhamdulillah.', 2),
  D('d-ilm', ['course_done', 'books_open'], 'Дуа о знании', 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا', 'Аллахумма инни ас-алюка ильман нафиа: о Аллах, прошу у Тебя полезного знания.', 'O Allah, I ask You for beneficial knowledge.', 'Ибн Маджа, 925'),
  A('a-read', ['books_open'], 'Читай во имя твоего Господа, который сотворил.', 'Read in the name of your Lord who created.', '96:1', 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ'),
  A('a-langs', ['langs_open'], 'Среди Его знамений — сотворение небес и земли и различие ваших языков и цветов.', 'Among His signs is the creation of the heavens and earth and the diversity of your languages and colours.', '30:22', 'وَاخْتِلَافُ أَلْسِنَتِكُمْ وَأَلْوَانِكُمْ'),

  // ───── Practice: body and food ─────
  H('h-strong', ['health_open', 'workout'], 'Сильный верующий лучше и любимее Аллахом, чем слабый, но в каждом из них благо.', 'The strong believer is better and more beloved to Allah than the weak believer, and in both there is good.', 'Муслим, 2664', 3),
  H('h-body', ['health_open'], 'У твоего тела есть право на тебя.', 'Your body has a right over you.', 'аль-Бухари, 5199'),
  P('p-workout', ['workout'], 'МашаАллах', 'ما شاء الله', 'Тренировка сделана. Сила для поклонения.', 'Workout done. Strength for worship.'),
  H('h-food-1', ['food_open'], 'Сын Адама не наполнял сосуда хуже, чем желудок. Треть для еды, треть для питья, треть для дыхания.', 'No human fills a vessel worse than his stomach: a third for food, a third for drink, a third for breath.', 'ат-Тирмизи, 2380', 3),
  H('h-food-2', ['food_open'], 'Скажи «Бисмиллях», ешь правой рукой и ешь из того, что перед тобой.', 'Say Bismillah, eat with your right hand, and eat from what is in front of you.', 'аль-Бухари, 5376; Муслим, 2022', 2),
  A('a-food', ['food_open'], 'Ешьте и пейте, но не излишествуйте.', 'Eat and drink, but do not be excessive.', '7:31', 'وَكُلُوا وَاشْرَبُوا وَلَا تُسْرِفُوا'),
  H('h-monthu', ['fast_monthu'], 'В понедельник и четверг дела представляются Аллаху, и я люблю, чтобы моё дело представлялось, когда я пощусь.', 'Deeds are presented on Monday and Thursday, and I love that my deeds are presented while I am fasting.', 'ат-Тирмизи, 747'),
  H('h-white', ['white_days'], 'Пост трёх дней каждого месяца, 13, 14 и 15 числа, подобен посту всей жизни.', 'Fasting three days of every month, the 13th, 14th and 15th, is like fasting a lifetime.', 'ан-Насаи, 2420; ат-Тирмизи, 761'),

  // ───── Practice: travel and umrah ─────
  D('d-safar', ['safar_on'], 'Хафизакаллах', 'حَفِظَكَ اللَّه', 'Да хранит тебя Аллах в пути. Сделай дуа путника: три дуа принимаются, среди них дуа путника.', 'May Allah protect you on your way. Three prayers are answered, among them the traveller’s.', 'ат-Тирмизи, 1905'),
  H('h-safar-2', ['safar_on'], 'Аллах любит, когда пользуются Его облегчениями, как не любит, когда совершают грех.', 'Allah loves that His concessions be taken, as He dislikes that sins be committed.', 'Ахмад, 5866'),
  H('h-umrah', ['umrah_open'], 'От умры до умры — искупление того, что между ними, а наградой за принятый хадж может быть только Рай.', 'From one umrah to the next is expiation for what is between them, and the reward of an accepted hajj is nothing but Paradise.', 'аль-Бухари, 1773; Муслим, 1349', 3),
  A('a-umrah', ['umrah_open'], 'Совершайте хадж и умру ради Аллаха.', 'Complete the hajj and umrah for Allah.', '2:196', 'وَأَتِمُّوا الْحَجَّ وَالْعُمْرَةَ لِلَّهِ'),

  // ───── Ramadan and special days ─────
  H('h-ramadan-1', ['ramadan_open'], 'Кто постился в Рамадан с верой и надеждой на награду, тому прощены прошлые грехи.', 'Whoever fasts Ramadan with faith and hoping for reward, his past sins are forgiven.', 'аль-Бухари, 38', 3),
  A('a-ramadan', ['ramadan_open'], 'О те, которые уверовали! Вам предписан пост, как он был предписан вашим предшественникам, — быть может, вы устрашитесь.', 'O you who believe, fasting is prescribed for you as it was for those before you, that you may be mindful.', '2:183', 'كُتِبَ عَلَيْكُمُ الصِّيَامُ'),
  H('h-ramadan-2', ['ramadan_open'], 'У постящегося две радости: когда он разговляется и когда встретит своего Господа.', 'The fasting person has two joys: when he breaks his fast and when he meets his Lord.', 'аль-Бухари, 7492; Муслим, 1151'),
  H('h-dhulhijja', ['dhulhijja'], 'Нет дней, в которые праведные дела любимее Аллаху, чем эти десять дней.', 'There are no days in which righteous deeds are more beloved to Allah than these ten days.', 'аль-Бухари, 969', 3),
  H('h-arafa', ['arafa'], 'Пост в день Арафа искупает грехи прошлого и следующего года.', 'Fasting the day of Arafah expiates the sins of the previous and the coming year.', 'Муслим, 1162'),
  H('h-ashura', ['ashura'], 'Пост в день Ашура искупает грехи прошлого года.', 'Fasting the day of Ashura expiates the sins of the previous year.', 'Муслим, 1162'),

  // ───── Circle ─────
  H('h-dua-absent', ['dua_got', 'dua_sent'], 'Дуа мусульманина за брата заочно принимается. Над его головой ангел, и каждый раз он говорит: «Амин, и тебе того же».', 'A Muslim’s prayer for his brother in his absence is answered; an angel says each time: “Ameen, and for you the same.”', 'Муслим, 2733', 3),
  P('p-dua-sent', ['dua_sent'], 'И тебе того же, ИншаАллах', 'ولك بمثل', 'Ангел отвечает на твоё дуа за брата или сестру.', 'An angel answers your prayer for your brother or sister.', 2),
  P('p-masha-sent', ['masha_sent'], 'МашаАллах', 'ما شاء الله', 'Радоваться успеху другого — тоже поклонение.', 'Rejoicing in another’s good is worship too.'),
  H('h-body-one', ['nudge_sent'], 'Верующие в любви и милосердии друг к другу подобны одному телу.', 'The believers in their love and mercy are like one body.', 'аль-Бухари, 6011; Муслим, 2586', 3),
  P('p-nudge', ['nudge_sent'], 'Да облегчит Аллах', 'يسّر الله', 'Мягкое напоминание отправлено. Сделай и дуа за него.', 'A gentle reminder was sent. Make dua for them too.'),
  H('h-guide', ['circle_join'], 'Кто указал на благо, тому награда, как совершившему его.', 'Whoever guides to good has a reward like the one who does it.', 'Муслим, 1893', 2),
  H('h-friend', ['circle_join'], 'Человек — на религии своего близкого друга, так смотрите же, с кем дружите.', 'A person is upon the religion of his close friend, so look at whom you befriend.', 'Абу Давуд, 4833; ат-Тирмизи, 2378', 2),

  // ───── Goals ─────
  H('h-niyya', ['goal_new'], 'Дела оцениваются только по намерениям.', 'Actions are only by intentions.', 'аль-Бухари, 1', 3),
  A('a-inshaallah', ['goal_new'], 'Никогда не говори: «Я сделаю это завтра», не добавив: «Если пожелает Аллах».', 'Never say “I will do this tomorrow” without adding “If Allah wills.”', '18:23–24', 'إِلَّا أَن يَشَاءَ اللَّهُ', 2),
  P('p-goal-new', ['goal_new'], 'Бисмиллях', 'بسم الله', 'Цель поставлена. ИншаАллах, дойдёшь.', 'Goal set. In sha Allah, you will reach it.', 2),
  A('a-change', ['goal_behind'], 'Аллах не меняет положения людей, пока они не изменят себя.', 'Allah does not change the condition of a people until they change themselves.', '13:11', 'إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ', 2),
  A('a-shukr', ['goal_step'], 'Если будете благодарны, Я приумножу вам.', 'If you are grateful, I will surely increase you.', '14:7', 'لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ', 2),
  P('p-goal-step', ['goal_step'], 'Альхамдулиллях!', 'الحمد لله', 'Шаг к цели сделан.', 'A step toward the goal.', 3),
  D('d-goal-done', ['goal_done'], 'Аллаху акбар! МашаАллах', 'رَبَّنَا تَقَبَّلْ مِنَّا', 'Цель достигнута. Раббана такаббаль минна: Господи, прими от нас.', 'Goal reached. Our Lord, accept from us.', '2:127'),
  A('a-tawakkul', ['goals_open'], 'Когда решишься, уповай на Аллаха.', 'When you have decided, rely upon Allah.', '3:159', 'فَإِذَا عَزَمْتَ فَتَوَكَّلْ عَلَى اللَّهِ'),
  H('h-time', ['goals_open'], 'Воспользуйся пятью до пяти: молодостью до старости, здоровьем до болезни, достатком до бедности, свободным временем до занятости и жизнью до смерти.', 'Take advantage of five before five: youth before old age, health before illness, wealth before poverty, free time before busyness, and life before death.', 'аль-Хаким, 7846; сахих'),

  // ───── Profile ─────
  H('h-tree', ['garden'], 'Если мусульманин посадит дерево, и с него поест человек или птица, это ему садака.', 'If a Muslim plants a tree and a person or bird eats from it, it is charity for him.', 'аль-Бухари, 2320'),
  P('p-profile', ['profile_saved'], 'БаракАллаху фик[/и]', 'بارك الله فيك', 'Профиль сохранён.', 'Profile saved.'),
];

// ───── Reply phrases between people (Circle) ─────
// The form depends on who you are thanking: a brother, a sister, or a group.
export type To = 'm' | 'f' | 'g';
export const THANKS: Record<To, { ru: string; ar: string; reply: string }> = {
  m: { ru: 'Джазакаллаху хайран', ar: 'جزاك الله خيرًا', reply: 'Ва ийяк' },
  f: { ru: 'Джазакиллаху хайран', ar: 'جزاكِ الله خيرًا', reply: 'Ва ийяки' },
  g: { ru: 'Джазакумуллаху хайран', ar: 'جزاكم الله خيرًا', reply: 'Ва ийякум' },
};
export const BARAKA: Record<To, { ru: string; ar: string; reply: string }> = {
  m: { ru: 'БаракАллаху фик', ar: 'بارك الله فيك', reply: 'Ва фика' },
  f: { ru: 'БаракАллаху фики', ar: 'بارك الله فيكِ', reply: 'Ва фики' },
  g: { ru: 'БаракАллаху фикум', ar: 'بارك الله فيكم', reply: 'Ва фикум' },
};
export const HAFIZA: Record<To, string> = { m: 'Хафизакаллах', f: 'Хафизакиллах', g: 'Хафизакумуллах' };

/** Picks the male or female Russian form: «выполнил[/а]» → «выполнил» / «выполнила»; unknown → «выполнил(а)». */
export function g(text: string, sex: Sex) {
  return text.replace(/\[([^/\]]*)\/([^\]]*)\]/g, (_, m: string, f: string) => (sex === 'f' ? f : sex === 'm' ? m : m === '' ? `(${f})` : `${m}(${f})`));
}

// ───── Engine ─────
const LOG = 'lm.words';
interface Log { seen: Record<string, string>; day: string; texts: number; last?: string; opened?: Record<string, string> }

function readLog(): Log {
  try { const v = JSON.parse(localStorage.getItem(LOG) || '') as Log; if (v && v.seen) return v; } catch { /* */ }
  return { seen: {}, day: '', texts: 0 };
}
function writeLog(l: Log) { try { localStorage.setItem(LOG, JSON.stringify(l)); } catch { /* */ } }

const CAP: Record<Mode, number> = { normal: 3, calm: 2, phrases: 0 };
/** Sections the person opened on purpose: a card there is welcome and does not use up the daily cap. */
const OWN: Trigger[] = ['quran_open', 'sadaqa_open', 'books_open', 'langs_open', 'health_open', 'food_open', 'umrah_open', 'ramadan_open', 'goals_open', 'safar_on'];
const daysAgo = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

function weighted(list: Card[]): Card | null {
  if (!list.length) return null;
  const total = list.reduce((n, c) => n + (c.w ?? 1), 0);
  let r = Math.random() * total;
  for (const c of list) { r -= c.w ?? 1; if (r <= 0) return c; }
  return list[list.length - 1];
}

/**
 * One card for a moment, or null. Respects: no repeat within 7 days (phrases may repeat, but never twice in a row),
 * at most CAP ayahs/hadiths a day outside sections opened on purpose, phrases only in the quietest mode.
 * `textChance` is how often an ayah or hadith is preferred over a short phrase for an action.
 */
export function pick(t: Trigger, today: string, mode: Mode = 'calm', opts: { textChance?: number; dry?: boolean } = {}): Card | null {
  const l = readLog();
  if (l.day !== today) { l.day = today; l.texts = 0; }
  const own = OWN.includes(t);
  // A section opened on purpose greets once a day, not on every visit.
  if (own && l.opened?.[t] === today) return null;
  const fresh = (c: Card) => !l.seen[c.id] || daysAgo(l.seen[c.id], today) >= 7;
  const all = CARDS.filter((c) => c.on.includes(t));
  const phrases = all.filter((c) => c.kind === 'phrase' && c.id !== l.last);
  const texts = all.filter((c) => c.kind !== 'phrase' && fresh(c));
  const canText = mode !== 'phrases' && (own || l.texts < CAP[mode]);
  const chance = opts.textChance ?? (own ? 1 : mode === 'normal' ? 0.45 : 0.3);
  let c: Card | null = null;
  if (canText && texts.length && (Math.random() < chance || !phrases.length)) c = weighted(texts);
  if (!c) c = weighted(phrases.filter(fresh).length ? phrases.filter(fresh) : phrases);
  if (!c) return null;
  if (!opts.dry) {
    l.seen[c.id] = today;
    l.last = c.id;
    if (c.kind !== 'phrase' && !own) l.texts++;
    if (own) l.opened = { ...(l.opened ?? {}), [t]: today };
    writeLog(l);
  }
  return c;
}

/** The same card all day for a section (no randomness on re-render), skipping cards seen in the last 7 days. */
export function cardOfDay(t: Trigger, today: string, mode: Mode = 'calm'): Card | null {
  const all = CARDS.filter((c) => c.on.includes(t) && (mode !== 'phrases' || c.kind === 'phrase' || c.kind === 'dua'));
  if (!all.length) return null;
  let h = 0;
  for (const ch of t + today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return all[h % all.length];
}

// ───── Event bus: anything can ask for a phrase; the <Words/> layer shows it ─────
export interface SayDetail { t: Trigger; extra?: string }
export function say(t: Trigger, extra?: string) {
  try { window.dispatchEvent(new CustomEvent<SayDetail>('lm:say', { detail: { t, extra } })); } catch { /* */ }
}

// ───── Calendar helpers ─────
export function hijriParts(d: Date): { day: number; month: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric' }).formatToParts(d);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    return day && month ? { day, month } : null;
  } catch { return null; }
}

/** A calendar reminder for today or tomorrow (fasts are reminded the day before), or null. */
export function calendarTrigger(now: Date): Trigger | null {
  const tomorrow = new Date(now.getTime() + 86400000);
  const ht = hijriParts(tomorrow);
  const h = hijriParts(now);
  if (ht?.month === 12 && ht.day === 9) return 'arafa';
  if (ht?.month === 1 && (ht.day === 9 || ht.day === 10)) return 'ashura';
  if (h?.month === 12 && h.day <= 9) return 'dhulhijja';
  if (ht && h?.month !== 9 && ht.month !== 9 && ht.day >= 13 && ht.day <= 15) return 'white_days';
  const wd = tomorrow.getDay();
  if (h?.month !== 9 && (wd === 1 || wd === 4)) return 'fast_monthu';
  return null;
}
