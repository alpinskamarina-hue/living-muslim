import { LANG } from './i18n';

// Countries and their main cities for prayer times and trips. Russian and English names side by side,
// so no entry in en.ts is needed. City names are what gets saved in settings/trip, in the current language.
// [ru, en, lat, lng]
type C = [string, string, number, number];
interface Country { id: string; ru: string; en: string; cities: C[] }

const RAW: Country[] = [
  { id: 'nl', ru: 'Нидерланды', en: 'Netherlands', cities: [
    ['Амстердам', 'Amsterdam', 52.3676, 4.9041], ['Роттердам', 'Rotterdam', 51.9244, 4.4777], ['Гаага', 'The Hague', 52.0705, 4.3007],
    ['Утрехт', 'Utrecht', 52.0907, 5.1214], ['Эйндховен', 'Eindhoven', 51.4416, 5.4697], ['Гронинген', 'Groningen', 53.2194, 6.5665],
    ['Тилбург', 'Tilburg', 51.5555, 5.0913], ['Алмере', 'Almere', 52.3508, 5.2647], ['Арнем', 'Arnhem', 51.9851, 5.8987], ['Неймеген', 'Nijmegen', 51.8126, 5.8372],
  ] },
  { id: 'ru', ru: 'Россия', en: 'Russia', cities: [
    ['Москва', 'Moscow', 55.7558, 37.6173], ['Санкт-Петербург', 'Saint Petersburg', 59.9343, 30.3351], ['Казань', 'Kazan', 55.7963, 49.1088],
    ['Уфа', 'Ufa', 54.7388, 55.9721], ['Махачкала', 'Makhachkala', 42.9849, 47.5047], ['Грозный', 'Grozny', 43.3178, 45.6949],
    ['Нальчик', 'Nalchik', 43.4853, 43.6071], ['Владикавказ', 'Vladikavkaz', 43.0241, 44.6814], ['Магас', 'Magas', 43.1717, 44.8114],
    ['Черкесск', 'Cherkessk', 44.2233, 42.0578], ['Майкоп', 'Maykop', 44.6098, 40.1006], ['Дербент', 'Derbent', 42.0579, 48.2885],
    ['Хасавюрт', 'Khasavyurt', 43.2509, 46.5876], ['Астрахань', 'Astrakhan', 46.3497, 48.0408], ['Набережные Челны', 'Naberezhnye Chelny', 55.7436, 52.3958],
    ['Альметьевск', 'Almetyevsk', 54.9014, 52.2973], ['Нижний Новгород', 'Nizhny Novgorod', 56.2965, 43.9361], ['Самара', 'Samara', 53.1959, 50.1002],
    ['Оренбург', 'Orenburg', 51.7682, 55.0969], ['Екатеринбург', 'Yekaterinburg', 56.8389, 60.6057], ['Челябинск', 'Chelyabinsk', 55.1644, 61.4368],
    ['Тюмень', 'Tyumen', 57.1522, 65.5272], ['Новосибирск', 'Novosibirsk', 55.0084, 82.9357], ['Краснодар', 'Krasnodar', 45.0355, 38.9753],
    ['Ростов-на-Дону', 'Rostov-on-Don', 47.2357, 39.7015], ['Ставрополь', 'Stavropol', 45.0428, 41.9734], ['Сочи', 'Sochi', 43.6028, 39.7342],
  ] },
  { id: 'uz', ru: 'Узбекистан', en: 'Uzbekistan', cities: [
    ['Ташкент', 'Tashkent', 41.2995, 69.2401], ['Самарканд', 'Samarkand', 39.6542, 66.9597], ['Бухара', 'Bukhara', 39.7681, 64.4556],
    ['Хива', 'Khiva', 41.3783, 60.3639], ['Андижан', 'Andijan', 40.7821, 72.3442], ['Наманган', 'Namangan', 40.9983, 71.6726],
    ['Фергана', 'Fergana', 40.3842, 71.7843], ['Нукус', 'Nukus', 42.4531, 59.6103], ['Карши', 'Qarshi', 38.8606, 65.7891], ['Термез', 'Termez', 37.2242, 67.2783],
  ] },
  { id: 'kz', ru: 'Казахстан', en: 'Kazakhstan', cities: [
    ['Алматы', 'Almaty', 43.2389, 76.8897], ['Астана', 'Astana', 51.1694, 71.4491], ['Шымкент', 'Shymkent', 42.3417, 69.5901],
    ['Туркестан', 'Turkestan', 43.2973, 68.2518], ['Караганда', 'Karaganda', 49.8047, 73.1094], ['Актобе', 'Aktobe', 50.2839, 57.167],
    ['Атырау', 'Atyrau', 47.0945, 51.9238], ['Актау', 'Aktau', 43.6355, 51.1693], ['Тараз', 'Taraz', 42.9, 71.3667],
  ] },
  { id: 'kg', ru: 'Кыргызстан', en: 'Kyrgyzstan', cities: [
    ['Бишкек', 'Bishkek', 42.8746, 74.5698], ['Ош', 'Osh', 40.5283, 72.7985], ['Джалал-Абад', 'Jalal-Abad', 40.9333, 73.0], ['Каракол', 'Karakol', 42.4907, 78.3936],
  ] },
  { id: 'tj', ru: 'Таджикистан', en: 'Tajikistan', cities: [
    ['Душанбе', 'Dushanbe', 38.5598, 68.787], ['Худжанд', 'Khujand', 40.2826, 69.6221], ['Куляб', 'Kulob', 37.9146, 69.7845], ['Бохтар', 'Bokhtar', 37.8364, 68.7803],
  ] },
  { id: 'tm', ru: 'Туркменистан', en: 'Turkmenistan', cities: [
    ['Ашхабад', 'Ashgabat', 37.9601, 58.3261], ['Туркменабад', 'Turkmenabat', 39.0733, 63.5786], ['Мары', 'Mary', 37.5936, 61.8303],
  ] },
  { id: 'az', ru: 'Азербайджан', en: 'Azerbaijan', cities: [
    ['Баку', 'Baku', 40.4093, 49.8671], ['Гянджа', 'Ganja', 40.6828, 46.3606], ['Сумгаит', 'Sumgait', 40.5855, 49.6317], ['Шеки', 'Shaki', 41.1919, 47.1706],
  ] },
  { id: 'ge', ru: 'Грузия', en: 'Georgia', cities: [
    ['Тбилиси', 'Tbilisi', 41.7151, 44.8271], ['Батуми', 'Batumi', 41.6168, 41.6367], ['Кутаиси', 'Kutaisi', 42.2679, 42.6946],
  ] },
  { id: 'tr', ru: 'Турция', en: 'Turkey', cities: [
    ['Стамбул', 'Istanbul', 41.0082, 28.9784], ['Анкара', 'Ankara', 39.9334, 32.8597], ['Анталья', 'Antalya', 36.8969, 30.7133],
    ['Измир', 'Izmir', 38.4237, 27.1428], ['Бурса', 'Bursa', 40.1885, 29.061], ['Конья', 'Konya', 37.8746, 32.4932],
    ['Трабзон', 'Trabzon', 41.0027, 39.7168], ['Аланья', 'Alanya', 36.5438, 31.9998], ['Газиантеп', 'Gaziantep', 37.0662, 37.3833],
    ['Шанлыурфа', 'Sanliurfa', 37.1591, 38.7969], ['Бодрум', 'Bodrum', 37.0344, 27.4305],
  ] },
  { id: 'sa', ru: 'Саудовская Аравия', en: 'Saudi Arabia', cities: [
    ['Мекка', 'Makkah', 21.4225, 39.8262], ['Медина', 'Medina', 24.4672, 39.6111], ['Джидда', 'Jeddah', 21.4858, 39.1925],
    ['Эр-Рияд', 'Riyadh', 24.7136, 46.6753], ['Таиф', 'Taif', 21.2703, 40.4158], ['Даммам', 'Dammam', 26.4207, 50.0888],
    ['Табук', 'Tabuk', 28.3835, 36.5662], ['Абха', 'Abha', 18.2164, 42.5053], ['Эль-Ула', 'AlUla', 26.6086, 37.9232],
  ] },
  { id: 'ae', ru: 'ОАЭ', en: 'UAE', cities: [
    ['Дубай', 'Dubai', 25.2048, 55.2708], ['Абу-Даби', 'Abu Dhabi', 24.4539, 54.3773], ['Шарджа', 'Sharjah', 25.3463, 55.4209],
    ['Аджман', 'Ajman', 25.4052, 55.5136], ['Рас-эль-Хайма', 'Ras Al Khaimah', 25.8007, 55.9762], ['Фуджейра', 'Fujairah', 25.1288, 56.3265],
  ] },
  { id: 'qa', ru: 'Катар', en: 'Qatar', cities: [['Доха', 'Doha', 25.2854, 51.531]] },
  { id: 'kw', ru: 'Кувейт', en: 'Kuwait', cities: [['Эль-Кувейт', 'Kuwait City', 29.3759, 47.9774]] },
  { id: 'bh', ru: 'Бахрейн', en: 'Bahrain', cities: [['Манама', 'Manama', 26.2285, 50.586]] },
  { id: 'om', ru: 'Оман', en: 'Oman', cities: [['Маскат', 'Muscat', 23.588, 58.3829], ['Салала', 'Salalah', 17.0151, 54.0924], ['Низва', 'Nizwa', 22.9333, 57.5333]] },
  { id: 'jo', ru: 'Иордания', en: 'Jordan', cities: [['Амман', 'Amman', 31.9539, 35.9106], ['Акаба', 'Aqaba', 29.5321, 35.0063], ['Ирбид', 'Irbid', 32.5568, 35.8469]] },
  { id: 'ps', ru: 'Палестина', en: 'Palestine', cities: [['Иерусалим (Аль-Кудс)', 'Jerusalem (Al-Quds)', 31.7767, 35.2345], ['Хеврон (Аль-Халиль)', 'Hebron (Al-Khalil)', 31.5326, 35.0998], ['Газа', 'Gaza', 31.5017, 34.4668]] },
  { id: 'eg', ru: 'Египет', en: 'Egypt', cities: [
    ['Каир', 'Cairo', 30.0444, 31.2357], ['Александрия', 'Alexandria', 31.2001, 29.9187], ['Хургада', 'Hurghada', 27.2579, 33.8116],
    ['Шарм-эль-Шейх', 'Sharm El Sheikh', 27.9158, 34.33], ['Луксор', 'Luxor', 25.6872, 32.6396], ['Асуан', 'Aswan', 24.0889, 32.8998],
  ] },
  { id: 'ma', ru: 'Марокко', en: 'Morocco', cities: [
    ['Касабланка', 'Casablanca', 33.5731, -7.5898], ['Рабат', 'Rabat', 34.0209, -6.8416], ['Марракеш', 'Marrakesh', 31.6295, -7.9811],
    ['Фес', 'Fez', 34.0181, -5.0078], ['Танжер', 'Tangier', 35.7595, -5.834], ['Агадир', 'Agadir', 30.4278, -9.5981],
  ] },
  { id: 'tn', ru: 'Тунис', en: 'Tunisia', cities: [['Тунис', 'Tunis', 36.8065, 10.1815], ['Сус', 'Sousse', 35.8256, 10.636], ['Джерба', 'Djerba', 33.8076, 10.8451]] },
  { id: 'dz', ru: 'Алжир', en: 'Algeria', cities: [['Алжир', 'Algiers', 36.7538, 3.0588], ['Оран', 'Oran', 35.6971, -0.6308], ['Константина', 'Constantine', 36.365, 6.6147]] },
  { id: 'ir', ru: 'Иран', en: 'Iran', cities: [['Тегеран', 'Tehran', 35.6892, 51.389], ['Исфахан', 'Isfahan', 32.6539, 51.666], ['Шираз', 'Shiraz', 29.5918, 52.5837], ['Мешхед', 'Mashhad', 36.2605, 59.6168]] },
  { id: 'iq', ru: 'Ирак', en: 'Iraq', cities: [['Багдад', 'Baghdad', 33.3152, 44.3661], ['Эрбиль', 'Erbil', 36.1911, 44.0092], ['Басра', 'Basra', 30.5085, 47.7804]] },
  { id: 'pk', ru: 'Пакистан', en: 'Pakistan', cities: [['Карачи', 'Karachi', 24.8607, 67.0011], ['Лахор', 'Lahore', 31.5204, 74.3587], ['Исламабад', 'Islamabad', 33.6844, 73.0479]] },
  { id: 'in', ru: 'Индия', en: 'India', cities: [['Дели', 'Delhi', 28.6139, 77.209], ['Мумбаи', 'Mumbai', 19.076, 72.8777], ['Хайдарабад', 'Hyderabad', 17.385, 78.4867]] },
  { id: 'bd', ru: 'Бангладеш', en: 'Bangladesh', cities: [['Дакка', 'Dhaka', 23.8103, 90.4125], ['Читтагонг', 'Chittagong', 22.3569, 91.7832]] },
  { id: 'mv', ru: 'Мальдивы', en: 'Maldives', cities: [['Мале', 'Malé', 4.1755, 73.5093]] },
  { id: 'my', ru: 'Малайзия', en: 'Malaysia', cities: [['Куала-Лумпур', 'Kuala Lumpur', 3.139, 101.6869], ['Пенанг', 'Penang', 5.4141, 100.3288], ['Лангкави', 'Langkawi', 6.35, 99.8], ['Кота-Кинабалу', 'Kota Kinabalu', 5.9804, 116.0735]] },
  { id: 'id', ru: 'Индонезия', en: 'Indonesia', cities: [['Джакарта', 'Jakarta', -6.2088, 106.8456], ['Бали (Денпасар)', 'Bali (Denpasar)', -8.65, 115.2167], ['Сурабая', 'Surabaya', -7.2575, 112.7521], ['Джокьякарта', 'Yogyakarta', -7.7956, 110.3695], ['Банда-Ачех', 'Banda Aceh', 5.5483, 95.3238]] },
  { id: 'sg', ru: 'Сингапур', en: 'Singapore', cities: [['Сингапур', 'Singapore', 1.3521, 103.8198]] },
  { id: 'th', ru: 'Таиланд', en: 'Thailand', cities: [['Бангкок', 'Bangkok', 13.7563, 100.5018], ['Пхукет', 'Phuket', 7.8804, 98.3923]] },
  { id: 'gb', ru: 'Великобритания', en: 'United Kingdom', cities: [
    ['Лондон', 'London', 51.5074, -0.1278], ['Бирмингем', 'Birmingham', 52.4862, -1.8904], ['Манчестер', 'Manchester', 53.4808, -2.2426],
    ['Брэдфорд', 'Bradford', 53.795, -1.7594], ['Лестер', 'Leicester', 52.6369, -1.1398], ['Глазго', 'Glasgow', 55.8642, -4.2518],
  ] },
  { id: 'de', ru: 'Германия', en: 'Germany', cities: [
    ['Берлин', 'Berlin', 52.52, 13.405], ['Кёльн', 'Cologne', 50.9375, 6.9603], ['Дюссельдорф', 'Düsseldorf', 51.2277, 6.7735],
    ['Франкфурт', 'Frankfurt', 50.1109, 8.6821], ['Мюнхен', 'Munich', 48.1351, 11.582], ['Гамбург', 'Hamburg', 53.5511, 9.9937],
    ['Штутгарт', 'Stuttgart', 48.7758, 9.1829], ['Дортмунд', 'Dortmund', 51.5136, 7.4653], ['Эссен', 'Essen', 51.4556, 7.0116],
  ] },
  { id: 'be', ru: 'Бельгия', en: 'Belgium', cities: [['Брюссель', 'Brussels', 50.8503, 4.3517], ['Антверпен', 'Antwerp', 51.2194, 4.4025], ['Льеж', 'Liège', 50.6326, 5.5797], ['Гент', 'Ghent', 51.0543, 3.7174]] },
  { id: 'fr', ru: 'Франция', en: 'France', cities: [['Париж', 'Paris', 48.8566, 2.3522], ['Марсель', 'Marseille', 43.2965, 5.3698], ['Лион', 'Lyon', 45.764, 4.8357], ['Страсбург', 'Strasbourg', 48.5734, 7.7521], ['Ницца', 'Nice', 43.7102, 7.262]] },
  { id: 'at', ru: 'Австрия', en: 'Austria', cities: [['Вена', 'Vienna', 48.2082, 16.3738], ['Зальцбург', 'Salzburg', 47.8095, 13.055]] },
  { id: 'ch', ru: 'Швейцария', en: 'Switzerland', cities: [['Цюрих', 'Zurich', 47.3769, 8.5417], ['Женева', 'Geneva', 46.2044, 6.1432]] },
  { id: 'dk', ru: 'Дания', en: 'Denmark', cities: [['Копенгаген', 'Copenhagen', 55.6761, 12.5683]] },
  { id: 'se', ru: 'Швеция', en: 'Sweden', cities: [['Стокгольм', 'Stockholm', 59.3293, 18.0686], ['Гётеборг', 'Gothenburg', 57.7089, 11.9746], ['Мальмё', 'Malmö', 55.605, 13.0038]] },
  { id: 'no', ru: 'Норвегия', en: 'Norway', cities: [['Осло', 'Oslo', 59.9139, 10.7522]] },
  { id: 'fi', ru: 'Финляндия', en: 'Finland', cities: [['Хельсинки', 'Helsinki', 60.1699, 24.9384]] },
  { id: 'pl', ru: 'Польша', en: 'Poland', cities: [['Варшава', 'Warsaw', 52.2297, 21.0122], ['Краков', 'Kraków', 50.0647, 19.945]] },
  { id: 'cz', ru: 'Чехия', en: 'Czechia', cities: [['Прага', 'Prague', 50.0755, 14.4378]] },
  { id: 'it', ru: 'Италия', en: 'Italy', cities: [['Рим', 'Rome', 41.9028, 12.4964], ['Милан', 'Milan', 45.4642, 9.19]] },
  { id: 'es', ru: 'Испания', en: 'Spain', cities: [['Мадрид', 'Madrid', 40.4168, -3.7038], ['Барселона', 'Barcelona', 41.3874, 2.1686], ['Гранада', 'Granada', 37.1773, -3.5986], ['Кордова', 'Córdoba', 37.8882, -4.7794]] },
  { id: 'pt', ru: 'Португалия', en: 'Portugal', cities: [['Лиссабон', 'Lisbon', 38.7223, -9.1393]] },
  { id: 'ba', ru: 'Босния и Герцеговина', en: 'Bosnia and Herzegovina', cities: [['Сараево', 'Sarajevo', 43.8563, 18.4131], ['Мостар', 'Mostar', 43.3438, 17.8078]] },
  { id: 'al', ru: 'Албания', en: 'Albania', cities: [['Тирана', 'Tirana', 41.3275, 19.8187]] },
  { id: 'xk', ru: 'Косово', en: 'Kosovo', cities: [['Приштина', 'Pristina', 42.6629, 21.1655], ['Призрен', 'Prizren', 42.2139, 20.7397]] },
  { id: 'mk', ru: 'Северная Македония', en: 'North Macedonia', cities: [['Скопье', 'Skopje', 41.9981, 21.4254]] },
  { id: 'bg', ru: 'Болгария', en: 'Bulgaria', cities: [['София', 'Sofia', 42.6977, 23.3219], ['Пловдив', 'Plovdiv', 42.1354, 24.7453], ['Варна', 'Varna', 43.2141, 27.9147]] },
  { id: 'ua', ru: 'Украина', en: 'Ukraine', cities: [['Киев', 'Kyiv', 50.4501, 30.5234], ['Одесса', 'Odesa', 46.4825, 30.7233]] },
  { id: 'by', ru: 'Беларусь', en: 'Belarus', cities: [['Минск', 'Minsk', 53.9006, 27.559]] },
  { id: 'us', ru: 'США', en: 'USA', cities: [['Нью-Йорк', 'New York', 40.7128, -74.006], ['Чикаго', 'Chicago', 41.8781, -87.6298], ['Лос-Анджелес', 'Los Angeles', 34.0522, -118.2437], ['Хьюстон', 'Houston', 29.7604, -95.3698], ['Детройт', 'Detroit', 42.3314, -83.0458]] },
  { id: 'ca', ru: 'Канада', en: 'Canada', cities: [['Торонто', 'Toronto', 43.6532, -79.3832], ['Монреаль', 'Montreal', 45.5017, -73.5673], ['Ванкувер', 'Vancouver', 49.2827, -123.1207]] },
  { id: 'au', ru: 'Австралия', en: 'Australia', cities: [['Сидней', 'Sydney', -33.8688, 151.2093], ['Мельбурн', 'Melbourne', -37.8136, 144.9631]] },
  { id: 'za', ru: 'ЮАР', en: 'South Africa', cities: [['Кейптаун', 'Cape Town', -33.9249, 18.4241], ['Йоханнесбург', 'Johannesburg', -26.2041, 28.0473]] },
  { id: 'tz', ru: 'Танзания', en: 'Tanzania', cities: [['Занзибар', 'Zanzibar', -6.1659, 39.2026], ['Дар-эс-Салам', 'Dar es Salaam', -6.7924, 39.2083]] },
  { id: 'sn', ru: 'Сенегал', en: 'Senegal', cities: [['Дакар', 'Dakar', 14.7167, -17.4677]] },
  { id: 'ng', ru: 'Нигерия', en: 'Nigeria', cities: [['Лагос', 'Lagos', 6.5244, 3.3792], ['Кано', 'Kano', 12.0022, 8.592]] },
];

const en = LANG === 'en';
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, en ? 'en' : 'ru');

export interface Place { name: string; lat: number; lng: number; country: string }
export interface CountryPlaces { id: string; name: string; cities: Place[] }

/** Countries in the interface language, alphabetical; cities keep their order (capital and biggest first). */
export const COUNTRIES: CountryPlaces[] = RAW.map((c) => {
  const name = en ? c.en : c.ru;
  return { id: c.id, name, cities: c.cities.map(([ru, e, lat, lng]) => ({ name: en ? e : ru, lat, lng, country: c.id })) };
}).sort(byName);

export const ALL_PLACES: Place[] = COUNTRIES.flatMap((c) => c.cities);

/** The country a saved place belongs to: by name, else the nearest city within ~150 km. */
export function countryOf(p: { name?: string; lat: number; lng: number }): string {
  const hit = p.name ? ALL_PLACES.find((x) => x.name === p.name) : undefined;
  if (hit) return hit.country;
  let best = '', d = Infinity;
  for (const x of ALL_PLACES) {
    const dd = (x.lat - p.lat) ** 2 + ((x.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
    if (dd < d) { d = dd; best = x.country; }
  }
  return Math.sqrt(d) * 111 < 150 ? best : '';
}
