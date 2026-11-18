import { _t } from './i18n';
// Thirty days of Ramadan: an ayah (text comes from the Quran files), a hadith, a short lesson and one good deed.
// Hadith numbers follow the common numbering (Bukhari and Muslim as in Fath al-Bari / Abd al-Baqi).
export interface RDay {
  theme: [string, string];
  ayah: [number, number];
  hadith: { ru: string; en: string; src: [string, string] };
  lesson: [string, string];
  deed: [string, string];
}

const B = (n: number): [string, string] => [_t("аль-Бухари, {0}", n), `al-Bukhari, ${n}`];
const M = (n: number): [string, string] => [_t("Муслим, {0}", n), `Muslim, ${n}`];
const T = (n: number): [string, string] => [_t("ат-Тирмизи, {0}", n), `at-Tirmidhi, ${n}`];

export const RAMADAN_30: RDay[] = [
  { // 1
    theme: [_t("Намерение"), 'Intention'], ayah: [2, 183],
    hadith: { ru: _t("«Поистине, дела оцениваются по намерениям, и каждому достанется то, что он намеревался»."), en: '"Actions are only by intentions, and every person will have only what they intended."', src: B(1) },
    lesson: [_t("Пост начинается с намерения в сердце до рассвета. Не надо произносить его вслух: достаточно знать, что завтра ты постишься ради Аллаха."), 'The fast begins with an intention in the heart before dawn. It need not be said aloud: knowing you will fast tomorrow for Allah is enough.'],
    deed: [_t("Запиши три цели на этот Рамадан"), 'Write down three goals for this Ramadan'],
  },
  { // 2
    theme: [_t("Месяц Корана"), 'The month of the Quran'], ayah: [2, 185],
    hadith: { ru: _t("«Тому, кто постился в Рамадан с верой и надеждой на награду, будут прощены его прежние грехи»."), en: '"Whoever fasts Ramadan out of faith and hoping for reward, their previous sins will be forgiven."', src: B(38) },
    lesson: [_t("Коран был ниспослан в Рамадан, поэтому этот месяц и Коран неразделимы. Даже немного каждый день лучше, чем много один раз."), 'The Quran was revealed in Ramadan, so this month and the Quran belong together. A little every day is better than a lot once.'],
    deed: [_t("Прочитай на одну страницу Корана больше, чем планировал"), 'Read one page of the Quran more than you planned'],
  },
  { // 3
    theme: [_t("Он близко"), 'He is near'], ayah: [2, 186],
    hadith: { ru: _t("«Мольба (дуа) и есть поклонение»."), en: '"Supplication (du‘a) is worship."', src: T(2969) },
    lesson: [_t("Аят о дуа стоит прямо посреди аятов о посте. Постящийся близок к своему Господу, особенно перед ифтаром."), 'The ayah about du‘a sits right among the ayat on fasting. The one who fasts is close to their Lord, especially before iftar.'],
    deed: [_t("Добавь три дуа в свой список дуа"), 'Add three du‘as to your du‘a list'],
  },
  { // 4
    theme: [_t("Пост языка"), 'Fasting of the tongue'], ayah: [50, 18],
    hadith: { ru: _t("«Кто не оставил ложь и действия по ней, то Аллах не нуждается в том, чтобы он оставлял еду и питьё»."), en: '"Whoever does not give up false speech and acting on it, Allah has no need of them giving up their food and drink."', src: B(1903) },
    lesson: [_t("Пост — это не только живот. Сплетни, ложь и грубость отнимают награду, даже если человек весь день не ел."), 'Fasting is not only of the stomach. Gossip, lies and harsh words take away the reward, even if one ate nothing all day.'],
    deed: [_t("Один день без жалоб и разговоров о других"), 'One day without complaining or talking about others'],
  },
  { // 5
    theme: [_t("Пост — щит"), 'Fasting is a shield'], ayah: [2, 153],
    hadith: { ru: _t("«Пост — это щит. Пусть постящийся не сквернословит и не ведёт себя невежественно, а если кто-то станет ругаться с ним, пусть скажет: я пощусь»."), en: '"Fasting is a shield. So the fasting person should not use foul language or behave foolishly, and if someone fights or insults them, let them say: I am fasting."', src: B(1894) },
    lesson: [_t("Голод делает раздражительным. Фраза «я пощусь» напоминает в первую очередь тебе самому, зачем ты это делаешь."), 'Hunger makes us irritable. Saying "I am fasting" reminds you first of all why you are doing this.'],
    deed: [_t("Ответь на раздражение спокойствием"), 'Answer irritation with calm'],
  },
  { // 6
    theme: [_t("Сухур"), 'Suhoor'], ayah: [2, 187],
    hadith: { ru: _t("«Ешьте сухур, ведь в сухуре — благодать (баракат)»."), en: '"Eat suhoor, for in suhoor there is blessing."', src: B(1923) },
    lesson: [_t("Сухур — это сунна, а не просто завтрак. Даже глоток воды с намерением следовать сунне приносит награду. Последняя часть ночи — время дуа и истигфара."), 'Suhoor is a sunnah, not just breakfast. Even a sip of water with the intention of following the sunnah is rewarded. The end of the night is a time for du‘a and seeking forgiveness.'],
    deed: [_t("Не пропусти сухур и разбуди на него близких"), 'Do not skip suhoor, and wake your family for it'],
  },
  { // 7
    theme: [_t("Накорми постящегося"), 'Feed a fasting person'], ayah: [76, 8],
    hadith: { ru: _t("«Тому, кто накормит постящегося, будет такая же награда, как и ему, и награда постящегося не уменьшится»."), en: '"Whoever gives a fasting person food to break their fast will have a reward like theirs, without the fasting person’s reward being reduced at all."', src: T(807) },
    lesson: [_t("Ифтар не обязательно должен быть пышным. Финики и вода, отданные с открытым сердцем, — это уже накормить постящегося."), 'An iftar need not be lavish. Dates and water given with an open heart already count as feeding a fasting person.'],
    deed: [_t("Угости кого-то ифтаром или отнеси еду соседу"), 'Share iftar with someone or take food to a neighbour'],
  },
  { // 8
    theme: [_t("Щедрость"), 'Generosity'], ayah: [2, 261],
    hadith: { ru: _t("«Посланник Аллаха ﷺ был самым щедрым из людей, а особенно щедрым он становился в Рамадан, когда с ним встречался Джибриль»."), en: '"The Messenger of Allah ﷺ was the most generous of people, and he was most generous in Ramadan when Jibril met him."', src: B(6) },
    lesson: [_t("Садака в Рамадан не обязана быть большой. Важнее постоянство: понемногу каждый день."), 'Sadaqah in Ramadan does not have to be large. Consistency matters more: a little every day.'],
    deed: [_t("Дай садаку сегодня, даже маленькую"), 'Give sadaqah today, even a small amount'],
  },
  { // 9
    theme: [_t("Коран ведёт"), 'The Quran guides'], ayah: [17, 9],
    hadith: { ru: _t("«Читайте Коран, ведь в Судный день он придёт заступником за тех, кто его читал»."), en: '"Read the Quran, for it will come on the Day of Resurrection as an intercessor for its companions."', src: M(804) },
    lesson: [_t("Читать с переводом и размышлять над одним аятом иногда ценнее, чем быстро пройти много страниц."), 'Reading with a translation and reflecting on one ayah is sometimes worth more than rushing through many pages.'],
    deed: [_t("Прочитай одну страницу с переводом и выпиши один аят"), 'Read one page with translation and write down one ayah'],
  },
  { // 10
    theme: [_t("Учить и учиться"), 'Learn and teach'], ayah: [54, 17],
    hadith: { ru: _t("«Лучший из вас тот, кто изучал Коран и обучал ему других»."), en: '"The best of you are those who learn the Quran and teach it."', src: B(5027) },
    lesson: [_t("Учить не значит быть учёным. Показать ребёнку суру аль-Ихлас или поделиться смыслом аята с другом — тоже обучение."), 'Teaching does not mean being a scholar. Showing a child Surat al-Ikhlas or sharing the meaning of an ayah with a friend is teaching too.'],
    deed: [_t("Научи кого-то одному аяту или дуа"), 'Teach someone one ayah or du‘a'],
  },
  { // 11
    theme: [_t("Врата открыты"), 'The gates are open'], ayah: [3, 133],
    hadith: { ru: _t("«Когда наступает Рамадан, врата Рая открываются, врата Ада закрываются, а шайтаны заковываются в цепи»."), en: '"When Ramadan comes, the gates of Paradise are opened, the gates of Hell are closed and the devils are chained."', src: B(1899) },
    lesson: [_t("Треть месяца позади. Если что-то пошло не так, это не повод бросать. Сегодня тоже можно начать заново."), 'A third of the month is behind you. If something went wrong, it is no reason to give up. You can start again today.'],
    deed: [_t("Сделай одно доброе дело, которое давно откладывал"), 'Do one good deed you have been putting off'],
  },
  { // 12
    theme: [_t("Врата ар-Райян"), 'The gate of ar-Rayyan'], ayah: [39, 10],
    hadith: { ru: _t("«В Раю есть врата, которые называются ар-Райян. Через них в Судный день войдут постящиеся, и никто, кроме них, не войдёт через них»."), en: '"In Paradise there is a gate called ar-Rayyan. Those who fasted will enter through it on the Day of Resurrection, and no one else will enter through it."', src: B(1896) },
    lesson: [_t("Терпение в посте — это терпение в трёх вещах: в послушании, в отказе от запретного и в трудностях. Пост учит всем трём."), 'Patience in fasting is patience in three things: in obedience, in staying away from the forbidden and in hardship. Fasting trains all three.'],
    deed: [_t("Потерпи в чём-то одном и не показывай этого"), 'Be patient with one thing today and do not show it'],
  },
  { // 13
    theme: [_t("Покаяние"), 'Repentance'], ayah: [39, 53],
    hadith: { ru: _t("«Поистине, Всевышний Аллах простирает Свою руку ночью, чтобы покаялся тот, кто грешил днём, и простирает руку днём, чтобы покаялся тот, кто грешил ночью»."), en: '"Allah stretches out His hand at night so that the one who sinned during the day may repent, and stretches out His hand during the day so that the one who sinned at night may repent."', src: M(2759) },
    lesson: [_t("Нет греха больше милости Аллаха. Покаяние — это сожаление, отказ от греха и намерение не возвращаться к нему."), 'No sin is greater than Allah’s mercy. Repentance is regret, leaving the sin, and resolving not to return to it.'],
    deed: [_t("Скажи «Астагфируллах» 100 раз"), 'Say "Astaghfirullah" 100 times'],
  },
  { // 14
    theme: [_t("Родители"), 'Parents'], ayah: [17, 23],
    hadith: { ru: _t("Человек спросил: «Кто больше всех достоин моего хорошего отношения?» Пророк ﷺ ответил: «Твоя мать», — трижды, а потом: «Твой отец»."), en: 'A man asked: "Who most deserves my good companionship?" The Prophet ﷺ said: "Your mother," three times, and then: "Your father."', src: B(5971) },
    lesson: [_t("Доброта к родителям стоит в Коране сразу после единобожия. Если их уже нет, остаются дуа за них и садака от их имени."), 'In the Quran, kindness to parents comes right after worshipping Allah alone. If they have passed away, du‘a and sadaqah on their behalf remain.'],
    deed: [_t("Позвони родителям или сделай для них что-то"), 'Call your parents or do something for them'],
  },
  { // 15
    theme: [_t("Родственные связи"), 'Ties of kinship'], ayah: [4, 1],
    hadith: { ru: _t("«Кто хочет, чтобы его удел был расширен, а жизнь продлена, пусть поддерживает родственные связи»."), en: '"Whoever would like their provision to be expanded and their life to be extended, let them keep the ties of kinship."', src: B(5986) },
    lesson: [_t("Половина месяца. Рамадан — хорошее время помириться и написать тем, с кем давно не говорил."), 'Halfway through the month. Ramadan is a good time to make peace and message those you have not spoken to in a long time.'],
    deed: [_t("Напиши или позвони родственнику, с которым давно не говорил"), 'Message or call a relative you have not spoken to for a while'],
  },
  { // 16
    theme: [_t("Братство"), 'Brotherhood'], ayah: [49, 10],
    hadith: { ru: _t("«Не уверует никто из вас, пока не станет желать своему брату того же, чего желает себе»."), en: '"None of you truly believes until they love for their brother what they love for themselves."', src: B(13) },
    lesson: [_t("Дуа за брата или сестру заочно — одно из самых искренних дел: о нём никто не узнает."), 'A du‘a for a brother or sister in their absence is one of the most sincere deeds: no one will ever know about it.'],
    deed: [_t("Сделай дуа за друга по имени, без его ведома"), 'Make du‘a for a friend by name, without them knowing'],
  },
  { // 17
    theme: [_t("Бадр и упование"), 'Badr and trust'], ayah: [3, 123],
    hadith: { ru: _t("«Если бы вы уповали на Аллаха должным образом, Он наделял бы вас уделом так же, как наделяет птиц: утром они улетают голодными, а вечером возвращаются сытыми»."), en: '"If you relied on Allah as He truly should be relied upon, He would provide for you as He provides for the birds: they go out hungry in the morning and return full in the evening."', src: T(2344) },
    lesson: [_t("17 Рамадана 2 года хиджры произошла битва при Бадре. Упование — это сделать всё, что в твоих силах, и оставить результат Аллаху."), 'The Battle of Badr took place on 17 Ramadan, 2 AH. Trust means doing everything you can and leaving the outcome to Allah.'],
    deed: [_t("Сделай шаг в деле, которого боишься, и доверься Аллаху"), 'Take a step in something you fear, and trust Allah with it'],
  },
  { // 18
    theme: [_t("Поминание"), 'Remembrance'], ayah: [13, 28],
    hadith: { ru: _t("«Тот, кто поминает своего Господа, и тот, кто не поминает Его, подобны живому и мёртвому»."), en: '"The example of one who remembers their Lord and one who does not is like the living and the dead."', src: B(6407) },
    lesson: [_t("Зикр не требует времени: его можно делать в дороге, в очереди, перед сном. Утренние и вечерние азкары — хорошая основа."), 'Dhikr takes no extra time: you can do it on the way, in a queue, before sleep. The morning and evening adhkar are a good foundation.'],
    deed: [_t("Прочитай утренние и вечерние азкары"), 'Recite the morning and evening adhkar'],
  },
  { // 19
    theme: [_t("Благодарность"), 'Gratitude'], ayah: [14, 7],
    hadith: { ru: _t("«Удивительно положение верующего! Всё для него — благо. Если его постигает радость, он благодарит, и это благо для него. Если постигает беда, он терпит, и это тоже благо для него»."), en: '"How wonderful is the affair of the believer! All of it is good for them. If something good happens, they are grateful, and that is good for them. If hardship befalls them, they are patient, and that is good for them."', src: M(2999) },
    lesson: [_t("Голод в пост напоминает, как много у нас есть. Благодарность сердцем, языком и делами умножает блага."), 'Hunger in the fast reminds us how much we have. Gratitude with the heart, the tongue and deeds increases our blessings.'],
    deed: [_t("Запиши пять вещей, за которые благодарен"), 'Write down five things you are grateful for'],
  },
  { // 20
    theme: [_t("Перед последней декадой"), 'Before the last ten'], ayah: [73, 6],
    hadith: { ru: _t("«Пророк ﷺ совершал итикаф в последние десять дней Рамадана, пока Аллах не забрал его»."), en: '"The Prophet ﷺ used to observe i‘tikaf in the last ten days of Ramadan until Allah took him."', src: B(2026) },
    lesson: [_t("Завтра начинаются последние десять ночей, лучшие в году. Спланируй их заранее: сон, работу, садаку, дуа."), 'Tomorrow the last ten nights begin, the best of the year. Plan them ahead: sleep, work, sadaqah, du‘a.'],
    deed: [_t("Составь план последних десяти ночей"), 'Make a plan for the last ten nights'],
  },
  { // 21
    theme: [_t("Ночь предопределения"), 'The Night of Decree'], ayah: [97, 3],
    hadith: { ru: _t("«Ищите Ночь предопределения в нечётные ночи из последних десяти ночей Рамадана»."), en: '"Seek the Night of Decree in the odd nights of the last ten of Ramadan."', src: B(2017) },
    lesson: [_t("Одна ночь лучше тысячи месяцев, то есть больше 83 лет поклонения. Никто не знает точно, какая это ночь, поэтому стараются во все десять."), 'One night is better than a thousand months, more than 83 years of worship. No one knows exactly which night it is, so the effort goes into all ten.'],
    deed: [_t("Проведи эту ночь по плану ночи"), 'Spend tonight following your night plan'],
  },
  { // 22
    theme: [_t("Усердие ночью"), 'Effort at night'], ayah: [32, 16],
    hadith: { ru: _t("«Когда наступали последние десять дней Рамадана, Пророк ﷺ затягивал свой изар, оживлял ночи и будил свою семью»."), en: '"When the last ten days of Ramadan began, the Prophet ﷺ would tighten his waist wrapper, spend the night in worship and wake his family."', src: B(2024) },
    lesson: [_t("«Будил свою семью»: последние десять ночей — общее дело. Договорись с близкими, кто кого будит."), '"He would wake his family": the last ten nights are a shared effort. Agree with your family on who wakes whom.'],
    deed: [_t("Разбуди семью на ночной намаз"), 'Wake your family for the night prayer'],
  },
  { // 23
    theme: [_t("Простоять ночь"), 'Standing the night'], ayah: [44, 3],
    hadith: { ru: _t("«Тому, кто простоит Ночь предопределения с верой и надеждой на награду, будут прощены его прежние грехи»."), en: '"Whoever stands in prayer on the Night of Decree out of faith and hoping for reward, their previous sins will be forgiven."', src: B(35) },
    lesson: [_t("Простоять ночь можно по-разному: таравих, тахаджуд, чтение Корана, зикр, дуа. Даже два ракаата в последнюю треть ночи — это уже стояние."), 'Standing the night can take many forms: tarawih, tahajjud, Quran, dhikr, du‘a. Even two rak‘ahs in the last third of the night count.'],
    deed: [_t("Два ракаата тахаджуда в последнюю треть ночи"), 'Two rak‘ahs of tahajjud in the last third of the night'],
  },
  { // 24
    theme: [_t("Прощение"), 'Pardon'], ayah: [42, 25],
    hadith: { ru: _t("Аиша спросила: «Что мне говорить, если я узнаю Ночь предопределения?» Пророк ﷺ ответил: «Говори: Аллахумма иннака ‘афуввун тухиббу-ль-‘афва фа‘фу ‘анни»."), en: '‘A’ishah asked: "What should I say if I know which night is the Night of Decree?" He ﷺ said: "Say: Allahumma innaka ‘afuwwun tuhibbu-l-‘afwa fa‘fu ‘anni."', src: T(3513) },
    lesson: [_t("Аль-‘Афувв — Тот, кто стирает грехи, будто их не было. Просящий прощения у Аллаха сам учится прощать людей."), 'Al-‘Afuww is the One who erases sins as if they never were. Whoever asks Allah for pardon learns to pardon people too.'],
    deed: [_t("Прости в сердце того, кто тебя обидел"), 'Forgive in your heart someone who hurt you'],
  },
  { // 25
    theme: [_t("Последняя треть ночи"), 'The last third of the night'], ayah: [51, 18],
    hadith: { ru: _t("«Каждую ночь, когда остаётся последняя треть, наш Господь нисходит к ближнему небу и говорит: кто обратится ко Мне, чтобы Я ответил ему? Кто попросит Меня, чтобы Я дал ему? Кто попросит прощения, чтобы Я простил его?»"), en: '"Our Lord descends to the lowest heaven every night when the last third of the night remains, and says: Who is calling on Me so that I may answer them? Who is asking of Me so that I may give them? Who is seeking My forgiveness so that I may forgive them?"', src: B(1145) },
    lesson: [_t("Время последней трети считается от Магриба до Фаджра. Приложение показывает его в плане ночи для твоего города."), 'The last third is counted from Maghrib to Fajr. The app shows it for your city in the night plan.'],
    deed: [_t("Сделай дуа в последнюю треть ночи"), 'Make du‘a in the last third of the night'],
  },
  { // 26
    theme: [_t("Малое, но постоянное"), 'Small but constant'], ayah: [29, 69],
    hadith: { ru: _t("«Самые любимые Аллаху дела те, что постоянны, даже если они малы»."), en: '"The most beloved deeds to Allah are those done consistently, even if they are small."', src: B(6464) },
    lesson: [_t("Рамадан заканчивается, а Господь Рамадана остаётся. Выбери одну привычку, которую возьмёшь с собой после Ида."), 'Ramadan ends, but the Lord of Ramadan remains. Choose one habit to carry with you after Eid.'],
    deed: [_t("Выбери одну привычку, которую оставишь после Рамадана"), 'Choose one habit you will keep after Ramadan'],
  },
  { // 27
    theme: [_t("27-я ночь"), 'The 27th night'], ayah: [97, 5],
    hadith: { ru: _t("Убайй ибн Ка‘б клялся, что Ночь предопределения — это двадцать седьмая ночь, и говорил: «Её признак в том, что солнце в то утро восходит белым, без лучей»."), en: 'Ubayy ibn Ka‘b swore that the Night of Decree is the twenty-seventh night, and said: "Its sign is that the sun rises that morning white, without rays."', src: M(762) },
    lesson: [_t("Многие сподвижники считали 27-ю ночь самой вероятной, но не единственной. Не оставляй остальные нечётные ночи."), 'Many Companions held the 27th night to be the most likely, but not the only one. Do not neglect the other odd nights.'],
    deed: [_t("Дай садаку этой ночью"), 'Give sadaqah tonight'],
  },
  { // 28
    theme: [_t("Закят аль-фитр"), 'Zakat al-fitr'], ayah: [87, 14],
    hadith: { ru: _t("«Посланник Аллаха ﷺ установил закят аль-фитр как очищение постящегося от пустых и непристойных слов и как пропитание для бедных»."), en: '"The Messenger of Allah ﷺ prescribed zakat al-fitr as a purification for the fasting person from idle and indecent talk, and as food for the poor."', src: [_t("Абу Дауд, 1609"), 'Abu Dawud, 1609'] },
    lesson: [_t("Закят аль-фитр отдают до праздничного намаза, лучше за день-два, чтобы бедные успели приготовиться к Иду. Сумму объявляет мечеть."), 'Zakat al-fitr is given before the Eid prayer, ideally a day or two earlier so that the poor can prepare for Eid. Your mosque announces the amount.'],
    deed: [_t("Отдай закят аль-фитр за себя и семью"), 'Give zakat al-fitr for yourself and your family'],
  },
  { // 29
    theme: [_t("Завершить хорошо"), 'Ending well'], ayah: [2, 127],
    hadith: { ru: _t("«Поистине, дела оцениваются по их завершению»."), en: '"Deeds are judged by their endings."', src: B(6607) },
    lesson: [_t("Ибрахим и Исмаил строили Каабу и просили: «Прими от нас». Так завершают поклонение: не гордясь, а прося принять."), 'Ibrahim and Isma‘il built the Ka‘bah and asked: "Accept it from us." That is how worship ends: not with pride, but asking for acceptance.'],
    deed: [_t("Дочитай свой джуз и попроси Аллаха принять Рамадан"), 'Finish your juz and ask Allah to accept your Ramadan'],
  },
  { // 30
    theme: [_t("После Рамадана"), 'After Ramadan'], ayah: [15, 99],
    hadith: { ru: _t("«Кто постился в Рамадан, а потом добавил к нему шесть дней Шавваля, будто постился весь год»."), en: '"Whoever fasts Ramadan and follows it with six days of Shawwal, it is as if they fasted the whole year."', src: M(1164) },
    lesson: [_t("Поклонение не заканчивается с месяцем. Шесть дней Шавваля и одна оставленная привычка продолжают Рамадан на весь год."), 'Worship does not end with the month. Six days of Shawwal and one habit kept carry Ramadan through the year.'],
    deed: [_t("Наметь, когда будешь поститься шесть дней Шавваля"), 'Plan when you will fast the six days of Shawwal'],
  },
];
