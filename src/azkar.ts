// Morning and evening adhkar («Крепость мусульманина»). Texts need a review by a knowledgeable person (imam), like the hadiths in words.ts.
// Each item: Arabic, transliteration, meaning in our own words, source and virtue in RU and EN. The evening wording differs in a few items.
import type { AppState } from './types';
import { isEn, _t } from './i18n';
import { prayerTimes } from './prayer';
import { here } from './safar';
import { addDays, fromKey, hhmm } from './dates';

export type Part = 'm' | 'e';
type L = [string, string];
export interface Dhikr {
  id: string;
  when: 'b' | Part;   // both, morning only, evening only
  n: number;          // how many times
  short?: boolean;    // in the short set
  title: L;
  ar: string; arE?: string;
  tr: L; trE?: L;
  mean: L; meanE?: L;
  src: L;
  virtue?: L;
}

export const pick = (x: L) => (isEn ? x[1] : x[0]);

export const AZKAR: Dhikr[] = [
  {
    id: 'kursi', when: 'b', n: 1, short: true,
    title: ['Аят аль-Курси', 'Ayat al-Kursi'],
    ar: 'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ\nاللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ',
    tr: ['А‘узу билляхи мина-ш-шайтани-р-раджим. Аллаху ля иляха илля хуваль-хайюль-каййум. Ля та’хузуху синатун ва ля наум. Ляху ма фи-с-самавати ва ма филь-ард. Ман за-ллязи яшфа‘у ‘индаху илля би-изних. Я‘ляму ма байна айдихим ва ма хальфахум, ва ля юхитуна би шай’им-мин ‘ильмихи илля би ма шаа. Васи‘а курсийюху-с-самавати валь-ард, ва ля я’удуху хифзухума, ва хуваль-‘алийюль-‘азым.',
      'A‘udhu billahi mina-sh-shaytani-r-rajim. Allahu la ilaha illa huwal-hayyul-qayyum. La ta’khudhuhu sinatun wa la nawm. Lahu ma fis-samawati wa ma fil-ard. Man dhal-ladhi yashfa‘u ‘indahu illa bi-idhnih. Ya‘lamu ma bayna aydihim wa ma khalfahum, wa la yuhituna bi shay’im-min ‘ilmihi illa bima sha’. Wasi‘a kursiyyuhus-samawati wal-ard, wa la ya’uduhu hifzuhuma, wa huwal-‘aliyyul-‘azim.'],
    mean: ['Аллах, нет бога, кроме Него, Живого и Вечно Сущего. Его не берёт ни дремота, ни сон. Ему принадлежит всё на небесах и на земле. Никто не заступится перед Ним без Его позволения. Он знает, что было до них и что будет после, а они охватывают из Его знания лишь то, что Он пожелает. Его Курси шире небес и земли, и хранить их Ему не в тягость. Он Высокий, Великий. (Коран 2:255)',
      'Allah: there is no god but Him, the Ever-Living, the Sustainer of all. Neither drowsiness nor sleep overtakes Him. All that is in the heavens and the earth is His. No one can intercede with Him without His permission. He knows what is before them and what is behind them, and they grasp of His knowledge only what He wills. His Kursi spans the heavens and the earth, and guarding them does not tire Him. He is the Most High, the Most Great. (Quran 2:255)'],
    src: ['ан-Насаи, «ас-Сунан аль-Кубра»; аль-Хаким', 'an-Nasa’i, al-Sunan al-Kubra; al-Hakim'],
    virtue: ['Кто прочитает её утром, тот защищён от шайтана до вечера, а кто вечером, тот до утра.', 'Whoever recites it in the morning is protected from Shaytan until evening, and in the evening until morning.'],
  },
  {
    id: 'ikhlas', when: 'b', n: 3, short: true,
    title: ['Сура аль-Ихлас', 'Surah al-Ikhlas'],
    ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ',
    tr: ['Бисмилляхи-р-рахмани-р-рахим. Куль хуваЛлаху ахад. Аллаху-с-самад. Лям ялид ва лям юляд. Ва лям якун ляху куфуван ахад.', 'Bismillahir-rahmanir-rahim. Qul huwallahu ahad. Allahus-samad. Lam yalid wa lam yulad. Wa lam yakun lahu kufuwan ahad.'],
    mean: ['Скажи: Он Аллах, Единый. Аллах, ни в ком не нуждающийся, к Нему обращаются все. Он не родил и не был рождён, и нет никого, равного Ему.', 'Say: He is Allah, the One. Allah, the Self-Sufficient, to whom all turn. He neither begets nor was begotten, and there is none equal to Him.'],
    src: ['Абу Дауд, 5082; ат-Тирмизи, 3575', 'Abu Dawud, 5082; at-Tirmidhi, 3575'],
    virtue: ['Три последние суры, прочитанные утром и вечером по три раза, защитят тебя от всего.', 'The last three surahs, recited three times morning and evening, will suffice you against everything.'],
  },
  {
    id: 'falaq', when: 'b', n: 3, short: true,
    title: ['Сура аль-Фаляк', 'Surah al-Falaq'],
    ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِنْ شَرِّ مَا خَلَقَ ۝ وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ',
    tr: ['Бисмилляхи-р-рахмани-р-рахим. Куль а‘узу би раббиль-фаляк. Мин шарри ма халяк. Ва мин шарри гасикин иза вакаб. Ва мин шарри-н-наффасати филь-‘укад. Ва мин шарри хасидин иза хасад.', 'Bismillahir-rahmanir-rahim. Qul a‘udhu bi rabbil-falaq. Min sharri ma khalaq. Wa min sharri ghasiqin idha waqab. Wa min sharrin-naffathati fil-‘uqad. Wa min sharri hasidin idha hasad.'],
    mean: ['Скажи: прибегаю к защите Господа рассвета от зла того, что Он сотворил, от зла ночи, когда она наступает, от зла колдуний, дующих на узлы, и от зла завистника, когда он завидует.', 'Say: I seek refuge in the Lord of the daybreak from the evil of what He created, from the evil of the night when it falls, from the evil of those who blow on knots, and from the evil of the envier when he envies.'],
    src: ['Абу Дауд, 5082; ат-Тирмизи, 3575', 'Abu Dawud, 5082; at-Tirmidhi, 3575'],
  },
  {
    id: 'nas', when: 'b', n: 3, short: true,
    title: ['Сура ан-Нас', 'Surah an-Nas'],
    ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ',
    tr: ['Бисмилляхи-р-рахмани-р-рахим. Куль а‘узу би рабби-н-нас. Малики-н-нас. Иляхи-н-нас. Мин шарриль-васвасиль-ханнас. Аллязи юваспису фи судури-н-нас. Миналь-джиннати ва-н-нас.', 'Bismillahir-rahmanir-rahim. Qul a‘udhu bi rabbin-nas. Malikin-nas. Ilahin-nas. Min sharril-waswasil-khannas. Alladhi yuwaswisu fi sudurin-nas. Minal-jinnati wan-nas.'],
    mean: ['Скажи: прибегаю к защите Господа людей, Царя людей, Бога людей, от зла искусителя, который отступает при поминании Аллаха и нашёптывает в сердца людей, из джиннов и людей.', 'Say: I seek refuge in the Lord of people, the King of people, the God of people, from the evil of the whisperer who withdraws, who whispers into the hearts of people, from among jinn and people.'],
    src: ['Абу Дауд, 5082; ат-Тирмизи, 3575', 'Abu Dawud, 5082; at-Tirmidhi, 3575'],
  },
  {
    id: 'mulk', when: 'b', n: 1,
    title: ['Утро наступило, и власть у Аллаха', 'We have reached the morning'],
    ar: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَٰذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ',
    arE: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَٰذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ',
    tr: ['Асбахна ва асбахаль-мульку лиллях, валь-хамду лиллях, ля иляха илля Ллаху вахдаху ля шарика лях, ляхуль-мульку ва ляхуль-хамду ва хува ‘аля кулли шай’ин кадир. Рабби ас’алюка хайра ма фи хазаль-йауми ва хайра ма ба‘даху, ва а‘узу бика мин шарри ма фи хазаль-йауми ва шарри ма ба‘дах. Рабби а‘узу бика миналь-касали ва су’иль-кибар. Рабби а‘узу бика мин ‘азабин фи-н-нари ва ‘азабин филь-кабр.',
      'Asbahna wa asbahal-mulku lillah, wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu wa huwa ‘ala kulli shay’in qadir. Rabbi as’aluka khayra ma fi hadhal-yawmi wa khayra ma ba‘dahu, wa a‘udhu bika min sharri ma fi hadhal-yawmi wa sharri ma ba‘dah. Rabbi a‘udhu bika minal-kasali wa su’il-kibar. Rabbi a‘udhu bika min ‘adhabin fin-nari wa ‘adhabin fil-qabr.'],
    trE: ['Амсайна ва амсаль-мульку лиллях, валь-хамду лиллях, ля иляха илля Ллаху вахдаху ля шарика лях, ляхуль-мульку ва ляхуль-хамду ва хува ‘аля кулли шай’ин кадир. Рабби ас’алюка хайра ма фи хазихи-ль-ляйляти ва хайра ма ба‘даха, ва а‘узу бика мин шарри ма фи хазихи-ль-ляйляти ва шарри ма ба‘даха. Рабби а‘узу бика миналь-касали ва су’иль-кибар. Рабби а‘узу бика мин ‘азабин фи-н-нари ва ‘азабин филь-кабр.',
      'Amsayna wa amsal-mulku lillah, wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu wa huwa ‘ala kulli shay’in qadir. Rabbi as’aluka khayra ma fi hadhihil-laylati wa khayra ma ba‘daha, wa a‘udhu bika min sharri ma fi hadhihil-laylati wa sharri ma ba‘daha. Rabbi a‘udhu bika minal-kasali wa su’il-kibar. Rabbi a‘udhu bika min ‘adhabin fin-nari wa ‘adhabin fil-qabr.'],
    mean: ['Мы встретили утро, и вся власть в это утро у Аллаха. Хвала Аллаху, нет бога, кроме Него одного, у Него нет сотоварища, Ему власть и хвала, и Он всё может. Господи, прошу у Тебя добра этого дня и того, что после него, и прошу защиты от зла этого дня и того, что после него. Господи, защити меня от лени и тягот старости, от наказания в огне и в могиле.',
      'We have reached the morning, and all dominion this morning belongs to Allah. Praise be to Allah; there is no god but Allah alone, without partner; His is the dominion and the praise, and He has power over all things. My Lord, I ask You for the good of this day and what follows it, and seek refuge in You from the evil of this day and what follows it. My Lord, protect me from laziness and the hardship of old age, and from punishment in the Fire and in the grave.'],
    meanE: ['Мы встретили вечер, и вся власть в этот вечер у Аллаха. Хвала Аллаху, нет бога, кроме Него одного, у Него нет сотоварища, Ему власть и хвала, и Он всё может. Господи, прошу у Тебя добра этой ночи и того, что после неё, и прошу защиты от зла этой ночи и того, что после неё. Господи, защити меня от лени и тягот старости, от наказания в огне и в могиле.',
      'We have reached the evening, and all dominion this evening belongs to Allah. Praise be to Allah; there is no god but Allah alone, without partner; His is the dominion and the praise, and He has power over all things. My Lord, I ask You for the good of this night and what follows it, and seek refuge in You from the evil of this night and what follows it. My Lord, protect me from laziness and the hardship of old age, and from punishment in the Fire and in the grave.'],
    src: ['Муслим, 2723', 'Muslim, 2723'],
  },
  {
    id: 'bika', when: 'b', n: 1,
    title: ['С Тобой мы встречаем утро', 'By You we reach the morning'],
    ar: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
    arE: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
    tr: ['Аллахумма бика асбахна, ва бика амсайна, ва бика нахья, ва бика намуту, ва иляйка-н-нушур.', 'Allahumma bika asbahna, wa bika amsayna, wa bika nahya, wa bika namutu, wa ilaykan-nushur.'],
    trE: ['Аллахумма бика амсайна, ва бика асбахна, ва бика нахья, ва бика намуту, ва иляйкаль-масыр.', 'Allahumma bika amsayna, wa bika asbahna, wa bika nahya, wa bika namutu, wa ilaykal-masir.'],
    mean: ['О Аллах, благодаря Тебе мы дожили до утра и до вечера, Тобой живём и Тобой умираем, и к Тебе воскрешение.', 'O Allah, by You we reach the morning and by You we reach the evening, by You we live and by You we die, and to You is the resurrection.'],
    meanE: ['О Аллах, благодаря Тебе мы дожили до вечера и до утра, Тобой живём и Тобой умираем, и к Тебе возвращение.', 'O Allah, by You we reach the evening and by You we reach the morning, by You we live and by You we die, and to You is the final return.'],
    src: ['ат-Тирмизи, 3391', 'at-Tirmidhi, 3391'],
  },
  {
    id: 'sayyid', when: 'b', n: 1, short: true,
    title: ['Лучшая мольба о прощении', 'The master of seeking forgiveness'],
    ar: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ',
    tr: ['Аллахумма анта рабби, ля иляха илля ант, халяктани ва ана ‘абдук, ва ана ‘аля ‘ахдика ва ва‘дика ма-стата‘т. А‘узу бика мин шарри ма сана‘т. Абу’у ляка би ни‘матика ‘аляйя, ва абу’у би занби, фагфир ли, фа иннаху ля ягфиру-з-зунуба илля ант.', 'Allahumma anta rabbi, la ilaha illa ant, khalaqtani wa ana ‘abduk, wa ana ‘ala ‘ahdika wa wa‘dika mastata‘t. A‘udhu bika min sharri ma sana‘t. Abu’u laka bi ni‘matika ‘alayya, wa abu’u bi dhanbi, faghfir li, fa innahu la yaghfirudh-dhunuba illa ant.'],
    mean: ['О Аллах, Ты мой Господь, нет бога, кроме Тебя. Ты создал меня, и я Твой раб. Я держусь завета с Тобой, насколько могу. Прошу защиты от зла того, что я сделал. Признаю Твою милость ко мне и признаю свой грех. Прости меня, ведь никто не прощает грехи, кроме Тебя.', 'O Allah, You are my Lord; there is no god but You. You created me and I am Your servant. I keep Your covenant and promise as much as I can. I seek refuge in You from the evil of what I have done. I acknowledge Your favour upon me and I acknowledge my sin, so forgive me, for none forgives sins but You.'],
    src: ['аль-Бухари, 6306', 'al-Bukhari, 6306'],
    virtue: ['Кто скажет это днём с убеждённостью и умрёт до вечера, тот из людей Рая. И так же ночью.', 'Whoever says it during the day with conviction and dies before evening is among the people of Paradise, and likewise at night.'],
  },
  {
    id: 'afini', when: 'b', n: 3,
    title: ['Дай здоровья моему телу', 'Grant me well-being in my body'],
    ar: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ. اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ، وَأَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، لَا إِلَٰهَ إِلَّا أَنْتَ',
    tr: ['Аллахумма ‘афини фи бадани, Аллахумма ‘афини фи сам‘и, Аллахумма ‘афини фи басари, ля иляха илля ант. Аллахумма инни а‘узу бика миналь-куфри валь-факр, ва а‘узу бика мин ‘азабиль-кабр, ля иляха илля ант.', 'Allahumma ‘afini fi badani, Allahumma ‘afini fi sam‘i, Allahumma ‘afini fi basari, la ilaha illa ant. Allahumma inni a‘udhu bika minal-kufri wal-faqr, wa a‘udhu bika min ‘adhabil-qabr, la ilaha illa ant.'],
    mean: ['О Аллах, дай здоровья моему телу, слуху и зрению, нет бога, кроме Тебя. О Аллах, защити меня от неверия и бедности и от наказания в могиле, нет бога, кроме Тебя.', 'O Allah, grant well-being to my body, my hearing and my sight; there is no god but You. O Allah, I seek refuge in You from disbelief and poverty, and from the punishment of the grave; there is no god but You.'],
    src: ['Абу Дауд, 5090', 'Abu Dawud, 5090'],
  },
  {
    id: 'afw', when: 'b', n: 1,
    title: ['Прощение и благополучие', 'Pardon and well-being'],
    ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي وَآمِنْ رَوْعَاتِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي وَعَنْ يَمِينِي وَعَنْ شِمَالِي وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي',
    tr: ['Аллахумма инни ас’алюкаль-‘афва валь-‘афията фи-д-дунья валь-ахира. Аллахумма инни ас’алюкаль-‘афва валь-‘афията фи дини ва дуньяя ва ахли ва мали. Аллахумма-стур ‘ауратии ва амин рау‘ати. Аллахумма-хфазни мин байни ядайя ва мин хальфи ва ‘ан ямини ва ‘ан шимали ва мин фауки, ва а‘узу би ‘азаматика ан угталя мин тахти.', 'Allahumma inni as’alukal-‘afwa wal-‘afiyata fid-dunya wal-akhirah. Allahumma inni as’alukal-‘afwa wal-‘afiyata fi dini wa dunyaya wa ahli wa mali. Allahummastur ‘awrati wa amin raw‘ati. Allahummahfazni min bayni yadayya wa min khalfi wa ‘an yamini wa ‘an shimali wa min fawqi, wa a‘udhu bi ‘azamatika an ughtala min tahti.'],
    mean: ['О Аллах, прошу у Тебя прощения и благополучия в этом мире и в вечном, в моей религии, жизни, семье и имуществе. Скрой мои недостатки и успокой мои страхи. Храни меня спереди и сзади, справа и слева и сверху, и Твоим величием защити от беды снизу.', 'O Allah, I ask You for pardon and well-being in this world and the Hereafter, in my religion, my worldly life, my family and my wealth. Cover my faults and calm my fears. Guard me from in front and behind, from my right and left and from above, and by Your greatness protect me from being taken unawares from below.'],
    src: ['Абу Дауд, 5074; Ибн Маджа, 3871', 'Abu Dawud, 5074; Ibn Majah, 3871'],
  },
  {
    id: 'bismillah', when: 'b', n: 3, short: true,
    title: ['С именем Аллаха, с которым ничто не вредит', 'In the name of Allah, with whose name nothing harms'],
    ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، وَهُوَ السَّمِيعُ الْعَلِيمُ',
    tr: ['Бисмилляхи-ллязи ля ядурру ма‘а-смихи шай’ун филь-арды ва ля фи-с-сама’, ва хува-с-сами‘уль-‘алим.', 'Bismillahil-ladhi la yadurru ma‘asmihi shay’un fil-ardi wa la fis-sama’, wa huwas-sami‘ul-‘alim.'],
    mean: ['С именем Аллаха, с именем Которого ничто не вредит ни на земле, ни на небе. Он Слышащий, Знающий.', 'In the name of Allah, with whose name nothing on earth or in the heavens can cause harm. He is the All-Hearing, the All-Knowing.'],
    src: ['Абу Дауд, 5088; ат-Тирмизи, 3388', 'Abu Dawud, 5088; at-Tirmidhi, 3388'],
    virtue: ['Кто скажет это три раза утром и вечером, тому ничто не повредит.', 'Whoever says it three times morning and evening, nothing will harm him.'],
  },
  {
    id: 'raditu', when: 'b', n: 3,
    title: ['Я доволен Аллахом как Господом', 'I am pleased with Allah as Lord'],
    ar: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا',
    tr: ['Радыту билляхи раббан, ва биль-ислями динан, ва би Мухаммадин, салля Ллаху ‘аляйхи ва саллям, набийя.', 'Raditu billahi rabba, wa bil-islami dina, wa bi Muhammadin, sallallahu ‘alayhi wa sallam, nabiyya.'],
    mean: ['Я доволен Аллахом как Господом, исламом как религией и Мухаммадом ﷺ как пророком.', 'I am pleased with Allah as my Lord, with Islam as my religion and with Muhammad ﷺ as my Prophet.'],
    src: ['Абу Дауд, 5072; ат-Тирмизи, 3389', 'Abu Dawud, 5072; at-Tirmidhi, 3389'],
    virtue: ['Кто скажет это три раза утром и вечером, того Аллах обязательно обрадует в Судный день.', 'Whoever says it three times morning and evening, Allah will surely please him on the Day of Resurrection.'],
  },
  {
    id: 'hayy', when: 'b', n: 1,
    title: ['О Живой, о Вечно Сущий', 'O Ever-Living, O Sustainer'],
    ar: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَىٰ نَفْسِي طَرْفَةَ عَيْنٍ',
    tr: ['Я Хайю, я Каййум, би рахматика астагис, аслих ли ша’ни кулляху, ва ля такильни иля нафси тарфата ‘айн.', 'Ya Hayyu, ya Qayyum, bi rahmatika astaghith, aslih li sha’ni kullahu, wa la takilni ila nafsi tarfata ‘ayn.'],
    mean: ['О Живой, о Вечно Сущий, к Твоей милости взываю о помощи. Приведи в порядок все мои дела и не оставляй меня наедине с собой ни на миг.', 'O Ever-Living, O Sustainer, by Your mercy I call for help. Set right all my affairs and do not leave me to myself even for the blink of an eye.'],
    src: ['аль-Хаким; ан-Насаи, «Амаль аль-йаум валь-лейля»', 'al-Hakim; an-Nasa’i, ‘Amal al-Yawm wal-Laylah'],
  },
  {
    id: 'kalimat', when: 'e', n: 3,
    title: ['Защита совершенными словами Аллаха', 'Refuge in the perfect words of Allah'],
    ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    tr: ['А‘узу би калимати-Ллахи-т-таммати мин шарри ма халяк.', 'A‘udhu bi kalimatillahit-tammati min sharri ma khalaq.'],
    mean: ['Прибегаю к совершенным словам Аллаха от зла того, что Он сотворил.', 'I seek refuge in the perfect words of Allah from the evil of what He has created.'],
    src: ['Муслим, 2709', 'Muslim, 2709'],
    virtue: ['Кто скажет это вечером, тому в ту ночь не навредит жало.', 'Whoever says it in the evening, no sting will harm him that night.'],
  },
  {
    id: 'adada', when: 'm', n: 3,
    title: ['Хвала числом Его творений', 'Glory as many as His creation'],
    ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ',
    tr: ['СубханаЛлахи ва би хамдихи, ‘адада халькихи, ва рида нафсихи, ва зината ‘аршихи, ва мидада калиматих.', 'Subhanallahi wa bi hamdihi, ‘adada khalqihi, wa rida nafsihi, wa zinata ‘arshihi, wa midada kalimatih.'],
    mean: ['Пречист Аллах, и хвала Ему, столько раз, сколько Его творений, сколько Ему угодно, сколько весит Его Трон и сколько чернил для Его слов.', 'Glory and praise be to Allah, as many times as His creation, as much as pleases Him, as heavy as His Throne and as much as the ink of His words.'],
    src: ['Муслим, 2726', 'Muslim, 2726'],
  },
  {
    id: 'hasbi', when: 'b', n: 7,
    title: ['Мне достаточно Аллаха', 'Allah is sufficient for me'],
    ar: 'حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ، وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ',
    tr: ['Хасбия Ллаху, ля иляха илля хува, ‘аляйхи таваккальту, ва хува раббуль-‘аршиль-‘азым.', 'Hasbiyallahu, la ilaha illa huwa, ‘alayhi tawakkaltu, wa huwa rabbul-‘arshil-‘azim.'],
    mean: ['Мне достаточно Аллаха, нет бога, кроме Него. На Него я полагаюсь, и Он Господь великого Трона.', 'Allah is sufficient for me; there is no god but Him. In Him I put my trust, and He is the Lord of the mighty Throne.'],
    src: ['Абу Дауд, 5081', 'Abu Dawud, 5081'],
  },
  {
    id: 'tahlil', when: 'b', n: 10,
    title: ['Нет бога, кроме Аллаха', 'There is no god but Allah'],
    ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    tr: ['Ля иляха илля Ллаху вахдаху ля шарика лях, ляхуль-мульку ва ляхуль-хамд, ва хува ‘аля кулли шай’ин кадир.', 'La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa huwa ‘ala kulli shay’in qadir.'],
    mean: ['Нет бога, кроме Аллаха одного, у Него нет сотоварища. Ему власть и хвала, и Он всё может.', 'There is no god but Allah alone, without partner. His is the dominion and the praise, and He has power over all things.'],
    src: ['ан-Насаи, «Амаль аль-йаум валь-лейля»', 'an-Nasa’i, ‘Amal al-Yawm wal-Laylah'],
  },
  {
    id: 'subhan', when: 'b', n: 100, short: true,
    title: ['СубханаЛлахи ва бихамдихи', 'SubhanAllahi wa bihamdihi'],
    ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    tr: ['СубханаЛлахи ва би хамдих.', 'Subhanallahi wa bi hamdih.'],
    mean: ['Пречист Аллах, и хвала Ему.', 'Glory be to Allah and praise be to Him.'],
    src: ['Муслим, 2692', 'Muslim, 2692'],
    virtue: ['Кто скажет это сто раз утром и вечером, с лучшим в Судный день придёт лишь тот, кто сказал так же или больше.', 'Whoever says it a hundred times morning and evening, no one will come on the Day of Resurrection with anything better, except one who said the same or more.'],
  },
];

export type AzkarState = NonNullable<AppState['azkar']>;
export const azkarOf = (s: AppState): AzkarState => s.azkar ?? { m: [], e: [] };

/** The set for this part of the day, in order. */
export function setFor(part: Part, short: boolean) {
  return AZKAR.filter((d) => (d.when === 'b' || d.when === part) && (!short || d.short));
}

export const textOf = (d: Dhikr, part: Part) => ({
  ar: part === 'e' && d.arE ? d.arE : d.ar,
  tr: pick(part === 'e' && d.trE ? d.trE : d.tr),
  mean: pick(part === 'e' && d.meanE ? d.meanE : d.mean),
});

export const isDone = (s: AppState, day: string, part: Part) => azkarOf(s)[part].includes(day);

export function markDone(s: AppState, day: string, part: Part): AppState {
  const a = azkarOf(s);
  if (a[part].includes(day)) return s;
  return { ...s, azkar: { ...a, [part]: [...a[part], day].sort().slice(-400) } };
}

/** Days in a row with this part read, counting today if done, else from yesterday. */
export function streak(s: AppState, today: string, part: Part) {
  const set = new Set(azkarOf(s)[part]);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/**
 * Which part fits now and the line under it. Morning: from Fajr, best before sunrise, until Dhuhr.
 * Evening: from Asr, best before Maghrib, until sleep. Between Dhuhr and Asr the evening ones are next.
 */
export function azkarNow(s: AppState, today: string, now = new Date()) {
  const t = prayerTimes(here(s, today), fromKey(today));
  const ms = now.getTime();
  let part: Part, live: boolean, line: string;
  if (ms < t.fajr.getTime()) { part = 'e'; live = true; line = _t("Вечерние · можно до сна"); }
  else if (ms < t.sunrise.getTime()) { part = 'm'; live = true; line = _t("Утренние · до восхода {0}", hhmm(t.sunrise)); }
  else if (ms < t.dhuhr.getTime()) { part = 'm'; live = true; line = _t("Утренние · можно до Зухра {0}", hhmm(t.dhuhr)); }
  else if (ms < t.asr.getTime()) { part = 'e'; live = false; line = _t("Вечерние с Асра {0}", hhmm(t.asr)); }
  else if (ms < t.maghrib.getTime()) { part = 'e'; live = true; line = _t("Вечерние · до Магриба {0}", hhmm(t.maghrib)); }
  else { part = 'e'; live = true; line = _t("Вечерние · можно до сна"); }
  // Before Fajr it is still last night: the evening of yesterday.
  const day = ms < t.fajr.getTime() ? addDays(today, -1) : today;
  return { part, live, line, day, done: isDone(s, day, part) };
}

/** Habits that are about adhkar (by name), and whether one fits this part of the day. */
export function azkarHabits(s: AppState, part: Part) {
  return s.habits.filter((h) => {
    if (h.status !== 'active') return false;
    const a = h.action.toLowerCase();
    const m = /утр|morning/.test(a), e = /вечер|evening/.test(a);
    if (!/азкар|adhkar|azkar/.test(a) && !(/зикр|dhikr/.test(a) && (m || e))) return false;
    return part === 'm' ? m || !e : e || !m;
  });
}
