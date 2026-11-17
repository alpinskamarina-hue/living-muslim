// Video lessons on how to perform umrah, shown in the umrah screen. Lesson titles are short versions of the originals.

export interface ULesson { id: string; t: string; s: number; step?: string }
export interface UCourse { lang: 'ru' | 'en'; title: string; by: string; list: string; lessons: ULesson[] }

export const UMRAH_VIDEOS: UCourse[] = [
  {
    lang: 'ru', title: 'Инструкция по умре', by: 'Абу Ясин Руслан Маликов', list: 'PLK_aw3CMJI1LqQKzMRQ0zv34wUP8PM-Qg',
    lessons: [
      { id: 'Z1yhTDdKWZM', t: 'Этикет паломника, намерение, микаты', s: 870 },
      { id: 'e09LVvYMGL0', t: 'Что нельзя в ихраме, как в него войти', s: 462, step: 'ihram' },
      { id: '_zBAsdBwX14', t: 'Как надеть ихрам, идтыба и рамль', s: 377 },
      { id: '30s77AT6ZJs', t: 'Тальбия', s: 687, step: 'talbiya' },
      { id: 'tAmGvE9gKmk', t: 'Таваф и дуа «Раббана аатина»', s: 638, step: 'tawaf' },
      { id: '61vh-4dGRgE', t: 'Саи между Сафой и Марвой', s: 480, step: 'saee' },
      { id: 'jU_j-sjXeF4', t: 'Дуа на Сафе и Марве', s: 553 },
      { id: '6C7jEo5DgFI', t: 'Вся умра коротко, от начала до конца', s: 738 },
    ],
  },
  {
    lang: 'en', title: 'How to perform Umrah', by: 'Dr Haifaa Younis, Jannah Institute', list: 'PL1ABUur57Rl5DrEwZxNE-AAdB1iTGXEv0',
    lessons: [
      { id: 'sVC6q8fepV4', t: 'What to pack', s: 128 },
      { id: 'RvLEqxKdsZA', t: 'Dua for travel', s: 85 },
      { id: '9Jq6GMUAmjs', t: 'Ihram', s: 142, step: 'ihram' },
      { id: '7AkxibobHq0', t: 'Virtues of Madinah', s: 326 },
      { id: 'JdcZNL3pN6g', t: 'Masjid Quba', s: 56 },
      { id: 'bxlCAL7n8zQ', t: 'Entering the Masjid', s: 59, step: 'enter' },
      { id: '72hsD1zmUSI', t: 'Seeing the Kaabah', s: 113 },
      { id: 'oBGWiYXRNBM', t: 'Tawaf', s: 248, step: 'tawaf' },
      { id: 'XKEX5QUFZbQ', t: 'Maqam Ibrahim', s: 78, step: 'maqam' },
      { id: 'WtGDZRvRogo', t: "Sa'i", s: 176, step: 'saee' },
      { id: 'RWN9h7lubrQ', t: 'Farewell dua', s: 40 },
    ],
  },
];

export const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} мин`;
export const embed = (id: string, auto = true) => `https://www.youtube-nocookie.com/embed/${id}?${auto ? 'autoplay=1&' : ''}rel=0&playsinline=1`;
