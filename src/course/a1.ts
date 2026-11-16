// Spoken English A1: 30 short lessons. Each lesson: 6 key phrases, a short dialogue (you play B), a speaking task.
export interface Lesson {
  t: string; // title
  goal: string; // what you will be able to say
  p: [string, string][]; // [english, russian]
  d: ['A' | 'B', string, string][]; // dialogue lines [speaker, english, russian]
  task: string; // speaking task in Russian
}

export const A1: Lesson[] = [
  {
    t: 'Знакомство', goal: 'Поздороваться и представиться',
    p: [['Hello! My name is Nasim.', 'Привет! Меня зовут Насим.'], ["What's your name?", 'Как тебя зовут?'], ['Nice to meet you.', 'Приятно познакомиться.'], ['How are you?', 'Как дела?'], ["I'm fine, thank you. And you?", 'Хорошо, спасибо. А у тебя?'], ['See you later!', 'Увидимся!']],
    d: [['A', 'Hello! My name is Adam.', 'Привет! Меня зовут Адам.'], ['B', "Hi, Adam! I'm Nasim. Nice to meet you.", 'Привет, Адам! Я Насим. Приятно познакомиться.'], ['A', 'Nice to meet you too. How are you?', 'Мне тоже приятно. Как дела?'], ['B', "I'm fine, thank you. And you?", 'Хорошо, спасибо. А у тебя?'], ['A', "I'm good. See you later!", 'Хорошо. Увидимся!'], ['B', 'See you!', 'Пока!']],
    task: 'Поздоровайся, назови своё имя и спроси, как дела у собеседника.',
  },
  {
    t: 'Откуда ты', goal: 'Рассказать, откуда ты и где живёшь',
    p: [['Where are you from?', 'Откуда ты?'], ["I'm from Russia.", 'Я из России.'], ['I live in Amsterdam.', 'Я живу в Амстердаме.'], ['Where do you live?', 'Где ты живёшь?'], ['I was born in Dagestan.', 'Я родился в Дагестане.'], ['Is it a big city?', 'Это большой город?']],
    d: [['A', 'Where are you from?', 'Откуда ты?'], ['B', "I'm from Russia, but I live in Amsterdam.", 'Я из России, но живу в Амстердаме.'], ['A', 'Oh, nice! Is Amsterdam a big city?', 'О, здорово! Амстердам большой город?'], ['B', "Yes, it's quite big. Where are you from?", 'Да, довольно большой. А ты откуда?'], ['A', "I'm from London.", 'Я из Лондона.']],
    task: 'Расскажи, откуда ты, где родился и где живёшь сейчас.',
  },
  {
    t: 'Работа', goal: 'Сказать, чем ты занимаешься',
    p: [['What do you do?', 'Чем ты занимаешься?'], ["I'm an entrepreneur.", 'Я предприниматель.'], ['I have my own business.', 'У меня свой бизнес.'], ['I work from home.', 'Я работаю из дома.'], ['Do you like your job?', 'Тебе нравится твоя работа?'], ['Yes, I love it.', 'Да, очень нравится.']],
    d: [['A', 'What do you do?', 'Чем ты занимаешься?'], ['B', 'I have my own business.', 'У меня свой бизнес.'], ['A', 'Really? What kind of business?', 'Правда? Какой бизнес?'], ['B', 'An online store. I work from home.', 'Интернет-магазин. Я работаю из дома.'], ['A', 'Do you like it?', 'Тебе нравится?'], ['B', 'Yes, I love it.', 'Да, очень.']],
    task: 'Скажи, чем ты занимаешься, где работаешь и нравится ли тебе.',
  },
  {
    t: 'Семья', goal: 'Рассказать о семье',
    p: [['I have a big family.', 'У меня большая семья.'], ["I'm married.", 'Я женат.'], ['I have two children.', 'У меня двое детей.'], ['My brother lives in Moscow.', 'Мой брат живёт в Москве.'], ['Do you have any brothers or sisters?', 'У тебя есть братья или сёстры?'], ['My parents are retired.', 'Мои родители на пенсии.']],
    d: [['A', 'Do you have a big family?', 'У тебя большая семья?'], ['B', 'Yes. I have two brothers and a sister.', 'Да. У меня два брата и сестра.'], ['A', 'Are you married?', 'Ты женат?'], ['B', "Yes, I'm married. I have two children.", 'Да, женат. У меня двое детей.'], ['A', 'How old are they?', 'Сколько им лет?'], ['B', 'Five and eight.', 'Пять и восемь.']],
    task: 'Расскажи о своей семье: кто есть, где живут, сколько лет детям.',
  },
  {
    t: 'Числа и возраст', goal: 'Назвать возраст, телефон, количество',
    p: [['How old are you?', 'Сколько тебе лет?'], ["I'm thirty-two years old.", 'Мне тридцать два года.'], ["What's your phone number?", 'Какой у тебя номер телефона?'], ["It's oh-six, twelve, forty-five.", 'Ноль шесть, двенадцать, сорок пять.'], ['How many?', 'Сколько (штук)?'], ['Can you repeat, please?', 'Можете повторить, пожалуйста?']],
    d: [['A', "What's your phone number?", 'Какой у тебя номер?'], ['B', "It's oh-six, twelve, forty-five, ninety.", 'Ноль шесть, двенадцать, сорок пять, девяносто.'], ['A', 'Sorry, can you repeat, please?', 'Извини, можешь повторить?'], ['B', 'Sure. Oh-six, twelve, forty-five, ninety.', 'Конечно. Ноль шесть, двенадцать, сорок пять, девяносто.'], ['A', 'Thank you!', 'Спасибо!']],
    task: 'Назови свой возраст, свой номер телефона и сколько людей в твоей семье.',
  },
  {
    t: 'Мой день', goal: 'Описать обычный день',
    p: [['I wake up at six.', 'Я просыпаюсь в шесть.'], ['I pray Fajr and read the Quran.', 'Я совершаю Фаджр и читаю Коран.'], ['I have breakfast at seven.', 'Я завтракаю в семь.'], ['I start work at nine.', 'Я начинаю работать в девять.'], ['In the evening I spend time with my family.', 'Вечером я провожу время с семьёй.'], ['I go to bed at eleven.', 'Я ложусь спать в одиннадцать.']],
    d: [['A', 'What time do you wake up?', 'Во сколько ты просыпаешься?'], ['B', 'I wake up at six. I pray Fajr first.', 'В шесть. Сначала совершаю Фаджр.'], ['A', 'Wow, early! What do you do then?', 'Ого, рано! А потом?'], ['B', 'I have breakfast and start work at nine.', 'Завтракаю и в девять начинаю работать.'], ['A', 'And in the evening?', 'А вечером?'], ['B', 'I spend time with my family.', 'Провожу время с семьёй.']],
    task: 'Опиши свой обычный день от утра до вечера, называя время.',
  },
  {
    t: 'Еда и кафе', goal: 'Заказать еду',
    p: [["I'd like a coffee, please.", 'Мне кофе, пожалуйста.'], ['Can I see the menu?', 'Можно меню?'], ['Is this halal?', 'Это халяль?'], ["I don't eat pork.", 'Я не ем свинину.'], ['Can I have the bill, please?', 'Можно счёт, пожалуйста?'], ['It was delicious.', 'Было очень вкусно.']],
    d: [['A', 'Hello! What would you like?', 'Здравствуйте! Что желаете?'], ['B', 'Can I see the menu, please?', 'Можно меню, пожалуйста?'], ['A', 'Here you are.', 'Пожалуйста.'], ['B', 'Is the chicken halal?', 'Курица халяль?'], ['A', 'Yes, all our meat is halal.', 'Да, всё наше мясо халяль.'], ['B', "Great. I'd like the chicken and a tea, please.", 'Отлично. Мне курицу и чай, пожалуйста.']],
    task: 'Закажи обед в кафе: попроси меню, спроси про халяль, закажи и попроси счёт.',
  },
  {
    t: 'Покупки', goal: 'Спросить цену и купить',
    p: [['How much is this?', 'Сколько это стоит?'], ["It's twenty euros.", 'Это стоит двадцать евро.'], ['Do you have a smaller size?', 'Есть размер поменьше?'], ["I'm just looking.", 'Я просто смотрю.'], ['Can I pay by card?', 'Можно оплатить картой?'], ["I'll take it.", 'Я возьму это.']],
    d: [['A', 'Can I help you?', 'Вам помочь?'], ['B', 'Yes, how much is this jacket?', 'Да, сколько стоит эта куртка?'], ['A', "It's sixty euros.", 'Шестьдесят евро.'], ['B', 'Do you have a bigger size?', 'Есть размер побольше?'], ['A', 'Yes, here you are.', 'Да, вот.'], ['B', "Thanks. I'll take it. Can I pay by card?", 'Спасибо. Беру. Можно картой?']],
    task: 'Купи вещь в магазине: спроси цену, размер и способ оплаты.',
  },
  {
    t: 'Дорога', goal: 'Спросить и объяснить дорогу',
    p: [['Excuse me, where is the station?', 'Извините, где вокзал?'], ['Go straight.', 'Идите прямо.'], ['Turn left.', 'Поверните налево.'], ['Turn right.', 'Поверните направо.'], ["It's next to the bank.", 'Это рядом с банком.'], ['Is it far from here?', 'Это далеко отсюда?']],
    d: [['B', 'Excuse me, where is the mosque?', 'Извините, где мечеть?'], ['A', 'Go straight and turn left.', 'Идите прямо и поверните налево.'], ['B', 'Is it far from here?', 'Это далеко?'], ['A', 'No, about five minutes. It\'s next to the park.', 'Нет, минут пять. Рядом с парком.'], ['B', 'Thank you very much!', 'Большое спасибо!']],
    task: 'Спроси дорогу до мечети, а потом объясни дорогу от своего дома до магазина.',
  },
  {
    t: 'Время и дни', goal: 'Говорить о времени и днях недели',
    p: [['What time is it?', 'Который час?'], ["It's half past three.", 'Половина четвёртого.'], ['See you on Monday.', 'Увидимся в понедельник.'], ['I go to the mosque on Friday.', 'По пятницам я хожу в мечеть.'], ['Are you free tomorrow?', 'Ты свободен завтра?'], ["I'm busy today.", 'Сегодня я занят.']],
    d: [['A', 'Are you free tomorrow?', 'Ты свободен завтра?'], ['B', "Sorry, I'm busy tomorrow. What about Saturday?", 'Извини, завтра занят. Как насчёт субботы?'], ['A', 'Saturday is fine. What time?', 'Суббота подходит. Во сколько?'], ['B', 'At two o\'clock?', 'В два?'], ['A', 'Perfect. See you on Saturday.', 'Отлично. До субботы.']],
    task: 'Договорись о встрече: предложи день и время, откажись от одного варианта.',
  },
  {
    t: 'Погода', goal: 'Поговорить о погоде',
    p: [["What's the weather like?", 'Какая погода?'], ["It's raining.", 'Идёт дождь.'], ["It's cold today.", 'Сегодня холодно.'], ["It's sunny and warm.", 'Солнечно и тепло.'], ['I like summer.', 'Я люблю лето.'], ["Don't forget your umbrella.", 'Не забудь зонт.']],
    d: [['A', "What's the weather like in Amsterdam?", 'Какая погода в Амстердаме?'], ['B', "It's cold and it's raining.", 'Холодно и идёт дождь.'], ['A', 'Again? It rains a lot there!', 'Опять? Там часто дожди!'], ['B', 'Yes. I like summer more.', 'Да. Лето мне нравится больше.']],
    task: 'Расскажи, какая сегодня погода и какое время года ты любишь и почему.',
  },
  {
    t: 'Хобби', goal: 'Рассказать, что любишь делать',
    p: [['What do you do in your free time?', 'Что ты делаешь в свободное время?'], ['I like reading books.', 'Я люблю читать книги.'], ['I go to the gym three times a week.', 'Я хожу в зал три раза в неделю.'], ['I play football with friends.', 'Я играю в футбол с друзьями.'], ["I don't like watching TV.", 'Я не люблю смотреть телевизор.'], ['What about you?', 'А ты?']],
    d: [['A', 'What do you do in your free time?', 'Что делаешь в свободное время?'], ['B', 'I like reading and I go to the gym.', 'Люблю читать и хожу в зал.'], ['A', 'How often do you go to the gym?', 'Как часто ходишь в зал?'], ['B', 'Three times a week. What about you?', 'Три раза в неделю. А ты?'], ['A', 'I play football.', 'Я играю в футбол.']],
    task: 'Расскажи о трёх своих хобби и как часто ты ими занимаешься.',
  },
  {
    t: 'Планы', goal: 'Рассказать о планах (going to)',
    p: [["What are you going to do this weekend?", 'Что собираешься делать на выходных?'], ["I'm going to visit my parents.", 'Я собираюсь навестить родителей.'], ["I'm going to stay at home.", 'Я собираюсь остаться дома.'], ["We're going to the park.", 'Мы идём в парк.'], ['Do you want to join us?', 'Хочешь с нами?'], ['That sounds great!', 'Звучит здорово!']],
    d: [['A', 'What are you going to do this weekend?', 'Что будешь делать на выходных?'], ['B', "I'm going to visit my parents.", 'Собираюсь навестить родителей.'], ['A', 'Nice! On Sunday we\'re going to the park. Do you want to join us?', 'Здорово! В воскресенье мы идём в парк. Хочешь с нами?'], ['B', 'That sounds great!', 'Звучит отлично!']],
    task: 'Расскажи о своих планах на выходные и пригласи друга присоединиться.',
  },
  {
    t: 'Телефонный звонок', goal: 'Позвонить и записаться',
    p: [['Hello, this is Nasim speaking.', 'Здравствуйте, это Насим.'], ["I'd like to make an appointment.", 'Я хотел бы записаться.'], ['Can you call me back?', 'Можете мне перезвонить?'], ['Sorry, I can\'t hear you.', 'Извините, вас не слышно.'], ['Can you speak more slowly, please?', 'Можете говорить медленнее, пожалуйста?'], ['Thank you, goodbye.', 'Спасибо, до свидания.']],
    d: [['A', 'Good morning, City Clinic.', 'Доброе утро, городская клиника.'], ['B', "Hello, this is Nasim. I'd like to make an appointment.", 'Здравствуйте, это Насим. Хочу записаться.'], ['A', 'Is Thursday at ten OK?', 'Четверг в десять подходит?'], ['B', 'Sorry, can you speak more slowly, please?', 'Извините, можно помедленнее?'], ['A', 'Of course. Thursday. At ten o\'clock.', 'Конечно. Четверг. В десять часов.'], ['B', 'Yes, that\'s fine. Thank you, goodbye.', 'Да, подходит. Спасибо, до свидания.']],
    task: 'Позвони и запишись к врачу или в автосервис на удобный день.',
  },
  {
    t: 'Отель', goal: 'Заселиться в отель',
    p: [['I have a reservation.', 'У меня бронь.'], ['For three nights.', 'На три ночи.'], ['What time is breakfast?', 'Во сколько завтрак?'], ['What is the Wi-Fi password?', 'Какой пароль от Wi-Fi?'], ['Which way is the qibla?', 'В какой стороне кибла?'], ['The air conditioner doesn\'t work.', 'Кондиционер не работает.']],
    d: [['A', 'Good evening. How can I help you?', 'Добрый вечер. Чем могу помочь?'], ['B', 'Good evening. I have a reservation. My name is Nasim.', 'Добрый вечер. У меня бронь на имя Насим.'], ['A', 'Yes, for three nights. Here is your key.', 'Да, на три ночи. Вот ваш ключ.'], ['B', 'Thank you. What time is breakfast?', 'Спасибо. Во сколько завтрак?'], ['A', 'From seven to ten.', 'С семи до десяти.']],
    task: 'Заселись в отель: назови бронь, спроси про завтрак и Wi-Fi.',
  },
  {
    t: 'У врача', goal: 'Объяснить, что болит',
    p: [["I don't feel well.", 'Я плохо себя чувствую.'], ['I have a headache.', 'У меня болит голова.'], ['I have a fever.', 'У меня температура.'], ['My back hurts.', 'У меня болит спина.'], ['Since yesterday.', 'Со вчерашнего дня.'], ['Do I need any medicine?', 'Мне нужны лекарства?']],
    d: [['A', "What's the problem?", 'Что вас беспокоит?'], ['B', "I don't feel well. I have a headache and a fever.", 'Плохо себя чувствую. Болит голова и температура.'], ['A', 'Since when?', 'С какого времени?'], ['B', 'Since yesterday. Do I need any medicine?', 'Со вчера. Мне нужны лекарства?'], ['A', 'Yes, take this twice a day.', 'Да, принимайте это два раза в день.']],
    task: 'Объясни врачу, что у тебя болит и с какого времени.',
  },
  {
    t: 'Транспорт', goal: 'Купить билет и спросить про поезд',
    p: [['A ticket to Rotterdam, please.', 'Билет до Роттердама, пожалуйста.'], ['One way or return?', 'В одну сторону или туда и обратно?'], ['What time does the train leave?', 'Во сколько отходит поезд?'], ['Which platform?', 'Какая платформа?'], ['Is this seat free?', 'Это место свободно?'], ["I'm late.", 'Я опаздываю.']],
    d: [['B', 'A ticket to Rotterdam, please.', 'Билет до Роттердама, пожалуйста.'], ['A', 'One way or return?', 'В одну сторону или туда-обратно?'], ['B', 'Return, please. What time does the train leave?', 'Туда-обратно. Во сколько поезд?'], ['A', 'At ten fifteen, platform five.', 'В десять пятнадцать, платформа пять.'], ['B', 'Thank you!', 'Спасибо!']],
    task: 'Купи билет на поезд и узнай время и платформу.',
  },
  {
    t: 'На работе', goal: 'Короткие фразы для встреч',
    p: [["Let's start the meeting.", 'Давайте начнём встречу.'], ['I agree with you.', 'Я с тобой согласен.'], ["I'm not sure.", 'Я не уверен.'], ['Can you send me an email?', 'Можешь прислать мне письмо?'], ["I'll do it today.", 'Я сделаю это сегодня.'], ['What is the deadline?', 'Какой срок?']],
    d: [['A', "Let's start. Can you finish the report?", 'Начнём. Ты можешь закончить отчёт?'], ['B', 'Yes. What is the deadline?', 'Да. Какой срок?'], ['A', 'Friday.', 'Пятница.'], ['B', "OK, I'll do it by Friday. Can you send me the data?", 'Хорошо, сделаю к пятнице. Пришлёшь данные?'], ['A', "Sure, I'll send you an email.", 'Конечно, пришлю письмом.']],
    task: 'Проведи мини-встречу: дай задачу, спроси срок, договорись о следующем шаге.',
  },
  {
    t: 'Светская беседа', goal: 'Поддержать разговор',
    p: [['How was your day?', 'Как прошёл день?'], ['Not bad, thanks.', 'Неплохо, спасибо.'], ['Really? Tell me more.', 'Правда? Расскажи подробнее.'], ['That\'s interesting!', 'Интересно!'], ['I know what you mean.', 'Понимаю, о чём ты.'], ['Anyway, I have to go.', 'В общем, мне пора.']],
    d: [['A', 'How was your day?', 'Как прошёл день?'], ['B', 'Not bad, thanks. I was very busy at work.', 'Неплохо, спасибо. Много работы было.'], ['A', 'Me too. I had three meetings.', 'У меня тоже. Три встречи.'], ['B', 'I know what you mean. Anyway, I have to go.', 'Понимаю. В общем, мне пора.'], ['A', 'OK, see you!', 'Ладно, увидимся!']],
    task: 'Поддержи разговор с коллегой 1 минуту: спроси про день, отреагируй, вежливо закончи.',
  },
  {
    t: 'Прошлые выходные', goal: 'Рассказать о прошлом (Past Simple)',
    p: [['What did you do last weekend?', 'Что ты делал на прошлых выходных?'], ['I visited my friends.', 'Я навестил друзей.'], ['We went to the beach.', 'Мы ездили на пляж.'], ['I stayed at home and rested.', 'Я остался дома и отдыхал.'], ['It was great.', 'Было здорово.'], ["I didn't have time.", 'У меня не было времени.']],
    d: [['A', 'What did you do last weekend?', 'Что делал на выходных?'], ['B', 'I visited my parents. We had dinner together.', 'Навестил родителей. Мы вместе ужинали.'], ['A', 'Nice! How was it?', 'Здорово! Как прошло?'], ['B', 'It was great. And you?', 'Отлично. А ты?'], ['A', 'I stayed at home and rested.', 'Я остался дома и отдыхал.']],
    task: 'Расскажи, что ты делал вчера и на прошлых выходных.',
  },
  {
    t: 'Нравится, не нравится', goal: 'Выражать предпочтения',
    p: [['I really like it.', 'Мне очень нравится.'], ["I don't like it very much.", 'Мне не очень нравится.'], ['I prefer tea to coffee.', 'Я предпочитаю чай кофе.'], ['My favourite food is plov.', 'Моя любимая еда — плов.'], ["I can't stand noise.", 'Терпеть не могу шум.'], ['What do you prefer?', 'Что ты предпочитаешь?']],
    d: [['A', 'Tea or coffee?', 'Чай или кофе?'], ['B', 'I prefer tea. What about you?', 'Я предпочитаю чай. А ты?'], ['A', 'Coffee! What\'s your favourite food?', 'Кофе! А твоя любимая еда?'], ['B', 'My favourite food is plov.', 'Моя любимая еда — плов.']],
    task: 'Расскажи о любимой еде, месте и времени года, и о том, что тебе не нравится.',
  },
  {
    t: 'Приглашения', goal: 'Пригласить, принять, отказаться',
    p: [['Would you like to come to dinner?', 'Хочешь прийти на ужин?'], ['Yes, I\'d love to.', 'Да, с удовольствием.'], ["Sorry, I can't. I'm busy.", 'Извини, не могу. Я занят.'], ['Maybe next time.', 'Может, в другой раз.'], ['What time should I come?', 'Во сколько мне прийти?'], ['Can I bring anything?', 'Мне что-нибудь принести?']],
    d: [['A', 'Would you like to come to dinner on Friday?', 'Придёшь на ужин в пятницу?'], ['B', "Yes, I'd love to. What time should I come?", 'Да, с удовольствием. Во сколько прийти?'], ['A', 'After Maghrib, about six.', 'После Магриба, около шести.'], ['B', 'Great. Can I bring anything?', 'Отлично. Что-нибудь принести?'], ['A', 'Just bring yourself!', 'Просто приходи сам!']],
    task: 'Пригласи друга на ужин, а потом вежливо откажись от другого приглашения.',
  },
  {
    t: 'Извинения и просьбы', goal: 'Извиниться и вежливо попросить',
    p: [["I'm sorry, I'm late.", 'Извините, я опоздал.'], ["It's OK, no problem.", 'Ничего, всё в порядке.'], ['Could you help me, please?', 'Не могли бы вы мне помочь?'], ['Could you open the window?', 'Не могли бы вы открыть окно?'], ['Of course.', 'Конечно.'], ['Thank you for your help.', 'Спасибо за помощь.']],
    d: [['B', "I'm sorry, I'm late. The traffic was terrible.", 'Извини за опоздание. Ужасные пробки.'], ['A', "It's OK, no problem.", 'Ничего страшного.'], ['B', 'Could you help me with this box, please?', 'Можешь помочь с этой коробкой?'], ['A', 'Of course.', 'Конечно.'], ['B', 'Thank you for your help.', 'Спасибо за помощь.']],
    task: 'Извинись за опоздание и вежливо попроси о двух вещах.',
  },
  {
    t: 'Описание людей', goal: 'Описать внешность и характер',
    p: [['He is tall and has a beard.', 'Он высокий и с бородой.'], ['She has long dark hair.', 'У неё длинные тёмные волосы.'], ['He is very kind.', 'Он очень добрый.'], ['She is smart and funny.', 'Она умная и весёлая.'], ['What does he look like?', 'Как он выглядит?'], ['What is he like?', 'Какой он по характеру?']],
    d: [['A', 'What does your brother look like?', 'Как выглядит твой брат?'], ['B', 'He is tall and has a short beard.', 'Он высокий, с короткой бородой.'], ['A', 'And what is he like?', 'А какой он по характеру?'], ['B', 'He is very kind and funny.', 'Очень добрый и весёлый.']],
    task: 'Опиши внешность и характер близкого человека.',
  },
  {
    t: 'Дом', goal: 'Рассказать о своём доме',
    p: [['I live in an apartment.', 'Я живу в квартире.'], ['It has three rooms.', 'В ней три комнаты.'], ['The kitchen is small but cosy.', 'Кухня маленькая, но уютная.'], ["There's a park near my house.", 'Рядом с домом есть парк.'], ['I like my neighbourhood.', 'Мне нравится мой район.'], ['Come and visit us!', 'Приходи в гости!']],
    d: [['A', 'Do you live in a house or an apartment?', 'Ты живёшь в доме или квартире?'], ['B', 'In an apartment. It has three rooms.', 'В квартире. Три комнаты.'], ['A', 'Is it near the centre?', 'Близко к центру?'], ['B', 'Not really, but there\'s a big park near my house.', 'Не очень, но рядом большой парк.'], ['A', 'Sounds nice!', 'Звучит здорово!'], ['B', 'Come and visit us!', 'Приходи в гости!']],
    task: 'Опиши свой дом и район: сколько комнат, что рядом, что тебе нравится.',
  },
  {
    t: 'Вера', goal: 'Спокойно рассказать о своей религии',
    p: [["I'm Muslim.", 'Я мусульманин.'], ['I pray five times a day.', 'Я молюсь пять раз в день.'], ["I don't drink alcohol.", 'Я не пью алкоголь.'], ['In Ramadan we fast from dawn to sunset.', 'В Рамадан мы постимся от рассвета до заката.'], ['Is there a quiet place where I can pray?', 'Здесь есть тихое место, где можно помолиться?'], ['Thank you for understanding.', 'Спасибо за понимание.']],
    d: [['A', 'Would you like a glass of wine?', 'Хочешь бокал вина?'], ['B', "No, thank you. I don't drink alcohol. I'm Muslim.", 'Нет, спасибо. Я не пью алкоголь. Я мусульманин.'], ['A', 'Oh, sorry! Juice?', 'Ой, извини! Сок?'], ['B', 'Yes, please. Is there a quiet place where I can pray?', 'Да, пожалуйста. Здесь есть тихое место для молитвы?'], ['A', 'Sure, you can use the small room.', 'Конечно, можешь занять маленькую комнату.'], ['B', 'Thank you for understanding.', 'Спасибо за понимание.']],
    task: 'Объясни коллеге, почему ты не пьёшь алкоголь и где тебе нужно помолиться в обед.',
  },
  {
    t: 'Путешествие', goal: 'Пройти аэропорт',
    p: [['Here is my passport.', 'Вот мой паспорт.'], ["I'm here on holiday.", 'Я здесь в отпуске.'], ['I have one bag.', 'У меня одна сумка.'], ['Where is gate twelve?', 'Где выход двенадцать?'], ['My flight is delayed.', 'Мой рейс задерживается.'], ["I'd like a window seat.", 'Я бы хотел место у окна.']],
    d: [['A', 'Passport, please. What is the purpose of your visit?', 'Паспорт, пожалуйста. Цель визита?'], ['B', "Here is my passport. I'm here on holiday.", 'Вот паспорт. Я в отпуске.'], ['A', 'How long are you staying?', 'Сколько пробудете?'], ['B', 'One week.', 'Неделю.'], ['A', 'Enjoy your stay.', 'Хорошего отдыха.']],
    task: 'Пройди паспортный контроль и регистрацию: цель поездки, срок, багаж, место.',
  },
  {
    t: 'Бизнес-основы', goal: 'Представить свой бизнес',
    p: [['Let me introduce my company.', 'Позвольте представить мою компанию.'], ['We sell clothes online.', 'Мы продаём одежду онлайн.'], ['Our customers are in Europe.', 'Наши клиенты в Европе.'], ['We have ten employees.', 'У нас десять сотрудников.'], ["What's your price?", 'Какая у вас цена?'], ["Let's keep in touch.", 'Давайте будем на связи.']],
    d: [['A', 'So, what does your company do?', 'Итак, чем занимается ваша компания?'], ['B', 'We sell modest clothing online. Our customers are in Europe.', 'Мы продаём скромную одежду онлайн. Клиенты в Европе.'], ['A', 'Interesting. How big is your team?', 'Интересно. Какая у вас команда?'], ['B', 'We have ten employees.', 'Десять сотрудников.'], ['A', "Great. Let's keep in touch.", 'Отлично. Будем на связи.'], ['B', "Sure. Here's my card.", 'Конечно. Вот моя визитка.']],
    task: 'Представь свой бизнес за 1 минуту: что делаете, для кого, какая команда.',
  },
  {
    t: 'Мнение', goal: 'Сказать, что думаешь',
    p: [['I think it\'s a good idea.', 'Думаю, это хорошая идея.'], ["In my opinion, it's too expensive.", 'По-моему, это слишком дорого.'], ['I agree.', 'Согласен.'], ["I don't agree.", 'Не согласен.'], ['Why do you think so?', 'Почему ты так думаешь?'], ['Because it saves time.', 'Потому что это экономит время.']],
    d: [['A', 'What do you think about working from home?', 'Что думаешь о работе из дома?'], ['B', "I think it's a good idea.", 'Думаю, это хорошая идея.'], ['A', 'Why do you think so?', 'Почему?'], ['B', 'Because it saves time. I have more time for my family.', 'Это экономит время. Больше времени для семьи.'], ['A', 'I agree.', 'Согласен.']],
    task: 'Скажи своё мнение о соцсетях: что хорошо, что плохо и почему.',
  },
  {
    t: 'Итоговый разговор', goal: 'Поговорить 2 минуты о себе',
    p: [['Let me tell you about myself.', 'Расскажу о себе.'], ["I've been learning English for a month.", 'Я учу английский месяц.'], ['My goal is to speak with clients.', 'Моя цель — говорить с клиентами.'], ['I practise every day after Asr.', 'Я занимаюсь каждый день после Асра.'], ["I still make mistakes, but it's OK.", 'Я ещё ошибаюсь, но это нормально.'], ['Thank you for listening.', 'Спасибо, что выслушали.']],
    d: [['A', 'Tell me about yourself.', 'Расскажи о себе.'], ['B', "My name is Nasim. I'm from Russia and I live in Amsterdam.", 'Меня зовут Насим. Я из России, живу в Амстердаме.'], ['A', 'Why are you learning English?', 'Зачем ты учишь английский?'], ['B', 'My goal is to speak with clients. I practise every day.', 'Хочу говорить с клиентами. Занимаюсь каждый день.'], ['A', 'Your English is good!', 'У тебя хороший английский!'], ['B', 'Thank you! I still make mistakes, but it\'s OK.', 'Спасибо! Ещё ошибаюсь, но это нормально.']],
    task: 'Говори 2 минуты о себе: откуда ты, семья, работа, день, хобби, планы. Используй фразы из курса.',
  },
];
