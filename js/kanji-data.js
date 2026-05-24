// 초급 일본어 한자 학습 데이터 (JLPT N5 ~ N4 수준 필수 85자)
const KANJI_DATA = [
  // --- JLPT N5 필수 한자 ---
  {
    kanji: "日",
    grade: "N5",
    meaning: "날/해",
    onyomi: "ニチ, ジツ",
    kunyomi: "ひ, -び, -か",
    words: [
      { word: "一日", reading: "ついたち", meaning: "1일 (초하루)" },
      { word: "今日", reading: "きょう", meaning: "오늘" },
      { word: "日本語", reading: "にほんご", meaning: "일본어" },
      { word: "毎日", reading: "まいにち", meaning: "매일" }
    ]
  },
  {
    kanji: "月",
    grade: "N5",
    meaning: "달",
    onyomi: "ゲツ, ガツ",
    kunyomi: "つき",
    words: [
      { word: "月曜日", reading: "げつようび", meaning: "월요일" },
      { word: "一ヶ月", reading: "いっかげつ", meaning: "한 달" },
      { word: "今月", reading: "こんげつ", meaning: "이번 달" },
      { word: "三月", reading: "さんがつ", meaning: "3월" }
    ]
  },
  {
    kanji: "火",
    grade: "N5",
    meaning: "불",
    onyomi: "カ",
    kunyomi: "ひ, -び, ほ-",
    words: [
      { word: "火曜日", reading: "かようび", meaning: "화요일" },
      { word: "火山", reading: "かざん", meaning: "화산" },
      { word: "花火", reading: "はなび", meaning: "불꽃놀이" }
    ]
  },
  {
    kanji: "水",
    grade: "N5",
    meaning: "물",
    onyomi: "スイ",
    kunyomi: "みず",
    words: [
      { word: "水曜日", reading: "すいようび", meaning: "수요일" },
      { word: "水道", reading: "すいどう", meaning: "수도" },
      { word: "お水", reading: "おみず", meaning: "물 (존칭)" }
    ]
  },
  {
    kanji: "木",
    grade: "N5",
    meaning: "나무",
    onyomi: "モク, ボク",
    kunyomi: "き, こ-",
    words: [
      { word: "木曜日", reading: "もくようび", meaning: "목요일" },
      { word: "大木", reading: "たいぼく", meaning: "큰 나무" },
      { word: "木立", reading: "こだち", meaning: "수풀/나무숲" }
    ]
  },
  {
    kanji: "金",
    grade: "N5",
    meaning: "쇠/돈",
    onyomi: "キン, コン",
    kunyomi: "かね, かな-",
    words: [
      { word: "金曜日", reading: "きんようび", meaning: "금요일" },
      { word: "お金", reading: "おかね", meaning: "돈" },
      { word: "金物", reading: "かなもの", meaning: "철물" }
    ]
  },
  {
    kanji: "土",
    grade: "N5",
    meaning: "흙",
    onyomi: "ド, ト",
    kunyomi: "つち",
    words: [
      { word: "土曜日", reading: "どようび", meaning: "토요일" },
      { word: "土地", reading: "とち", meaning: "토지" },
      { word: "粘土", reading: "ねんど", meaning: "찰흙" }
    ]
  },
  {
    kanji: "人",
    grade: "N5",
    meaning: "사람",
    onyomi: "ジン, ニン",
    kunyomi: "ひと, -り, -と",
    words: [
      { word: "外国人", reading: "がいこくじん", meaning: "외국인" },
      { word: "三人", reading: "さんにん", meaning: "세 사람" },
      { word: "一人", reading: "ひとり", meaning: "한 사람/혼자" },
      { word: "大人", reading: "おとな", meaning: "어른" }
    ]
  },
  {
    kanji: "子",
    grade: "N5",
    meaning: "아들/아이",
    onyomi: "シ, ス, ツ",
    kunyomi: "こ, -こ",
    words: [
      { word: "子供", reading: "こども", meaning: "아이/자녀" },
      { word: "迷子", reading: "まいご", meaning: "미아" },
      { word: "女子", reading: "じょし", meaning: "여자" }
    ]
  },
  {
    kanji: "女",
    grade: "N5",
    meaning: "여자",
    onyomi: "ジョ, ニョ, ニョウ",
    kunyomi: "おんな, め",
    words: [
      { word: "女性", reading: "じょせい", meaning: "여성" },
      { word: "女の子", reading: "おんなのこ", meaning: "여자 아이" },
      { word: "女神", reading: "めがみ", meaning: "여신" }
    ]
  },
  {
    kanji: "男",
    grade: "N5",
    meaning: "남자",
    onyomi: "ダン, ナン",
    kunyomi: "おとこ, お",
    words: [
      { word: "男性", reading: "だんせい", meaning: "남성" },
      { word: "男の子", reading: "おとのこ", meaning: "남자 아이" },
      { word: "長男", reading: "ちょうなん", meaning: "장남" }
    ]
  },
  {
    kanji: "山",
    grade: "N5",
    meaning: "산",
    onyomi: "サン, セン",
    kunyomi: "やま",
    words: [
      { word: "富士山", reading: "ふじさん", meaning: "후지산" },
      { word: "山道", reading: "やまみち", meaning: "산길" },
      { word: "登山", reading: "とざん", meaning: "등산" }
    ]
  },
  {
    kanji: "川",
    grade: "N5",
    meaning: "내/강",
    onyomi: "セン",
    kunyomi: "かわ",
    words: [
      { word: "小川", reading: "おがわ", meaning: "개울/시내" },
      { word: "川岸", reading: "かわぎし", meaning: "강가/강변" }
    ]
  },
  {
    kanji: "田",
    grade: "N5",
    meaning: "밭/논",
    onyomi: "デン",
    kunyomi: "た",
    words: [
      { word: "水田", reading: "すいでん", meaning: "논" },
      { word: "油田", reading: "ゆでん", meaning: "유전" },
      { word: "成田", reading: "なりた", meaning: "나리타 (지명)" }
    ]
  },
  {
    kanji: "先",
    grade: "N5",
    meaning: "먼저/앞",
    onyomi: "セン",
    kunyomi: "さき, ま-ず",
    words: [
      { word: "先生", reading: "せんせい", meaning: "선생님" },
      { word: "先週", reading: "せんしゅう", meaning: "지난주" },
      { word: "指先", reading: "ゆびさき", meaning: "손가락 끝" }
    ]
  },
  {
    kanji: "生",
    grade: "N5",
    meaning: "날/살",
    onyomi: "セイ, ショウ",
    kunyomi: "い-きる, う-まれる, なま",
    words: [
      { word: "生活", reading: "せいかつ", meaning: "생활" },
      { word: "学生", reading: "がくせい", meaning: "학생" },
      { word: "生ビール", reading: "なまビール", meaning: "생맥주" },
      { word: "誕生日", reading: "たんじょうび", meaning: "생일" }
    ]
  },
  {
    kanji: "学",
    grade: "N5",
    meaning: "배울",
    onyomi: "ガク",
    kunyomi: "まな-ぶ",
    words: [
      { word: "学校", reading: "がっこう", meaning: "학교" },
      { word: "大学", reading: "だいがく", meaning: "대학교" },
      { word: "学ぶ", reading: "まなぶ", meaning: "배우다" },
      { word: "学者", reading: "がくしゃ", meaning: "학자" }
    ]
  },
  {
    kanji: "校",
    grade: "N5",
    meaning: "학교",
    onyomi: "コウ, キョウ",
    kunyomi: "none",
    words: [
      { word: "小学校", reading: "しょうがっこう", meaning: "초등학교" },
      { word: "校長", reading: "こうちょう", meaning: "교장" },
      { word: "校舎", reading: "こうしゃ", meaning: "교사 (학교 건물)" }
    ]
  },
  {
    kanji: "車",
    grade: "N5",
    meaning: "수레/차",
    onyomi: "シャ",
    kunyomi: "くるま",
    words: [
      { word: "電車", reading: "でんしゃ", meaning: "전철" },
      { word: "自動車", reading: "じどうしゃ", meaning: "자동차" },
      { word: "自転車", reading: "じてんしゃ", meaning: "자전거" }
    ]
  },
  {
    kanji: "行",
    grade: "N5",
    meaning: "갈",
    onyomi: "コウ, ギョウ",
    kunyomi: "い-く, おこな-う",
    words: [
      { word: "行く", reading: "いく", meaning: "가다" },
      { word: "旅行", reading: "りょこう", meaning: "여행" },
      { word: "行う", reading: "おこなう", meaning: "행하다/실시하다" },
      { word: "銀行", reading: "ぎんこう", meaning: "은행" }
    ]
  },
  {
    kanji: "来",
    grade: "N5",
    meaning: "올",
    onyomi: "ライ, タイ",
    kunyomi: "く-る, きた-る",
    words: [
      { word: "来る", reading: "くる", meaning: "오다" },
      { word: "来年", reading: "らいねん", meaning: "내년" },
      { word: "来日", reading: "らいにち", meaning: "방일 (일본에 옴)" }
    ]
  },
  {
    kanji: "食",
    grade: "N5",
    meaning: "먹을",
    onyomi: "ショク, ジキ",
    kunyomi: "た-べる, く-う",
    words: [
      { word: "食べる", reading: "たべる", meaning: "먹다" },
      { word: "食堂", reading: "しょくどう", meaning: "식당" },
      { word: "食事", reading: "しょくじ", meaning: "식사" },
      { word: "食べ物", reading: "たべもの", meaning: "음식" }
    ]
  },
  {
    kanji: "飲",
    grade: "N5",
    meaning: "마실",
    onyomi: "イン",
    kunyomi: "の-む",
    words: [
      { word: "飲む", reading: "のむ", meaning: "마시다" },
      { word: "飲み物", reading: "のみもの", meaning: "음료수" },
      { word: "飲食店", reading: "いんしょくてん", meaning: "음식점" }
    ]
  },
  {
    kanji: "見",
    grade: "N5",
    meaning: "볼",
    onyomi: "ケン",
    kunyomi: "み-る, み-える, み-せる",
    words: [
      { word: "見る", reading: "みる", meaning: "보다" },
      { word: "見学", reading: "けんがく", meaning: "견학" },
      { word: "花見", reading: "はなみ", meaning: "꽃구경" },
      { word: "意見", reading: "いけん", meaning: "의견" }
    ]
  },
  {
    kanji: "聞",
    grade: "N5",
    meaning: "들릴/들을",
    onyomi: "ブン, モン",
    kunyomi: "き-く, き-こえる",
    words: [
      { word: "聞く", reading: "きく", meaning: "듣다/묻다" },
      { word: "新聞", reading: "しんぶん", meaning: "신문" },
      { word: "聞き取り", reading: "ききとり", meaning: "청취" }
    ]
  },
  {
    kanji: "書",
    grade: "N5",
    meaning: "글/쓸",
    onyomi: "ショ",
    kunyomi: "か-く",
    words: [
      { word: "書く", reading: "かく", meaning: "쓰다" },
      { word: "図書館", reading: "としょかん", meaning: "도서관" },
      { word: "辞書", reading: "じしょ", meaning: "사전" },
      { word: "教科書", reading: "きょうかしょ", meaning: "교과서" }
    ]
  },
  {
    kanji: "読",
    grade: "N5",
    meaning: "읽을",
    onyomi: "ドク, トク",
    kunyomi: "よ-む",
    words: [
      { word: "読む", reading: "よむ", meaning: "읽다" },
      { word: "読書", reading: "どくしょ", meaning: "독서" },
      { word: "読み方", reading: "よみかた", meaning: "읽는 법" }
    ]
  },
  {
    kanji: "話",
    grade: "N5",
    meaning: "말할",
    onyomi: "ワ",
    kunyomi: "はな-す, はなし",
    words: [
      { word: "話す", reading: "はなす", meaning: "말하다" },
      { word: "電話", reading: "でんわ", meaning: "전화" },
      { word: "会話", reading: "かいわ", meaning: "회화" },
      { word: "お話", reading: "おはなし", meaning: "이야기 (존칭)" }
    ]
  },
  {
    kanji: "買",
    grade: "N5",
    meaning: "살",
    onyomi: "バイ",
    kunyomi: "か-う",
    words: [
      { word: "買う", reading: "かう", meaning: "사다" },
      { word: "買い物", reading: "かいもの", meaning: "쇼핑" }
    ]
  },
  {
    kanji: "友",
    grade: "N5",
    meaning: "벗/친구",
    onyomi: "ユウ",
    kunyomi: "とも",
    words: [
      { word: "友達", reading: "ともだち", meaning: "친구" },
      { word: "友人", reading: "ゆうじん", meaning: "우인 (친구)" },
      { word: "友情", reading: "ゆうじょう", meaning: "우정" }
    ]
  },
  {
    kanji: "時",
    grade: "N5",
    meaning: "때/시간",
    onyomi: "ジ",
    kunyomi: "とき, -どき",
    words: [
      { word: "時間", reading: "じかん", meaning: "시간" },
      { word: "時計", reading: "とけい", meaning: "시계" },
      { word: "時々", reading: "ときどき", meaning: "때때로/가끔" }
    ]
  },
  {
    kanji: "間",
    grade: "N5",
    meaning: "사이/간",
    onyomi: "カン, ケン",
    kunyomi: "あいだ, ま, あい",
    words: [
      { word: "間", reading: "あいだ", meaning: "사이/기간" },
      { word: "間に合う", reading: "まにあう", meaning: "시간에 맞추다" },
      { word: "人間", reading: "にんげん", meaning: "인간" }
    ]
  },
  {
    kanji: "年",
    grade: "N5",
    meaning: "해/년",
    onyomi: "ネン",
    kunyomi: "とし",
    words: [
      { word: "今年", reading: "ことし", meaning: "올해" },
      { word: "来년", reading: "らいねん", meaning: "내년" },
      { word: "毎年", reading: "まいとし/まいねん", meaning: "매년" },
      { word: "一年生", reading: "いちねんせい", meaning: "1학년" }
    ]
  },
  {
    kanji: "国",
    grade: "N5",
    meaning: "나라",
    onyomi: "コク",
    kunyomi: "くに",
    words: [
      { word: "外国", reading: "がいこく", meaning: "외국" },
      { word: "国籍", reading: "こくせき", meaning: "국적" },
      { word: "お国", reading: "おくに", meaning: "고향/나라" }
    ]
  },
  {
    kanji: "会",
    grade: "N5",
    meaning: "모일/만날",
    onyomi: "カイ, エ",
    kunyomi: "あ-う",
    words: [
      { word: "会う", reading: "あう", meaning: "만나다" },
      { word: "会社", reading: "かいしゃ", meaning: "회사" },
      { word: "会議", reading: "かいぎ", meaning: "회의" },
      { word: "教会", reading: "きょうかい", meaning: "교회" }
    ]
  },
  {
    kanji: "社",
    grade: "N5",
    meaning: "모임/회사",
    onyomi: "シャ",
    kunyomi: "やしろ",
    words: [
      { word: "社会", reading: "しゃかい", meaning: "사회" },
      { word: "神社", reading: "じんじゃ", meaning: "신사" },
      { word: "社長", reading: "しゃちょう", meaning: "사장" }
    ]
  },
  {
    kanji: "中",
    grade: "N5",
    meaning: "가운데/안",
    onyomi: "チュウ",
    kunyomi: "なか",
    words: [
      { word: "中心", reading: "ちゅうしん", meaning: "중심" },
      { word: "一日中", reading: "いちにちじゅう", meaning: "하루 종일" },
      { word: "中身", reading: "なかみ", meaning: "알맹이/속내" }
    ]
  },
  {
    kanji: "外",
    grade: "N5",
    meaning: "바깥/외",
    onyomi: "ガイ, ゲ",
    kunyomi: "そと, ほか, はず-す",
    words: [
      { word: "海外", reading: "かいがい", meaning: "해외" },
      { word: "外側", reading: "そとがわ", meaning: "바깥쪽" },
      { word: "意外", reading: "いがい", meaning: "의외" }
    ]
  },
  {
    kanji: "前",
    grade: "N5",
    meaning: "앞",
    onyomi: "ゼン",
    kunyomi: "まえ",
    words: [
      { word: "名前", reading: "なまえ", meaning: "이름" },
      { word: "午前", reading: "ごぜん", meaning: "오전" },
      { word: "駅前", reading: "えきまえ", meaning: "역 앞" }
    ]
  },
  {
    kanji: "後",
    grade: "N5",
    meaning: "뒤/뒤에",
    onyomi: "ゴ, コウ",
    kunyomi: "のち, うし-ろ, あと, おく-れる",
    words: [
      { word: "午後", reading: "ごご", meaning: "오후" },
      { word: "後ろ", reading: "うしろ", meaning: "뒤" },
      { word: "最後", reading: "さいご", meaning: "마지막" },
      { word: "その後", reading: "そのあと", meaning: "그 후" }
    ]
  },

  // --- JLPT N4 필수 한자 (가사 및 노래 공부용 감성 어휘 다수 포함) ---
  {
    kanji: "心",
    grade: "N4",
    meaning: "마음",
    onyomi: "シン",
    kunyomi: "こころ",
    words: [
      { word: "心配", reading: "しんぱい", meaning: "걱정/염려" },
      { word: "中心", reading: "ちゅうしん", meaning: "중심" },
      { word: "心地よい", reading: "ここちよい", meaning: "기분 좋다/상쾌하다" },
      { word: "本心", reading: "ほんしん", meaning: "본심" }
    ]
  },
  {
    kanji: "愛",
    grade: "N4",
    meaning: "사랑",
    onyomi: "アイ",
    kunyomi: "いと-しい",
    words: [
      { word: "愛する", reading: "あいする", meaning: "사랑하다" },
      { word: "愛情", reading: "あいじょう", meaning: "애정" },
      { word: "愛読", reading: "あいどく", meaning: "애독" }
    ]
  },
  {
    kanji: "歌",
    grade: "N4",
    meaning: "노래",
    onyomi: "カ",
    kunyomi: "うた, うた-う",
    words: [
      { word: "歌う", reading: "うたう", meaning: "노래하다" },
      { word: "歌手", reading: "かしゅ", meaning: "가수" },
      { word: "国歌", reading: "こっか", meaning: "애국가/국가" },
      { word: "歌声", reading: "うたごえ", meaning: "노래 소리" }
    ]
  },
  {
    kanji: "声",
    grade: "N4",
    meaning: "소리",
    onyomi: "セイ, ショウ",
    kunyomi: "こえ, こわ-",
    words: [
      { word: "声優", reading: "せいゆう", meaning: "성우" },
      { word: "大声", reading: "おおごえ", meaning: "큰 목소리" },
      { word: "話し声", reading: "はなしごえ", meaning: "말소리" }
    ]
  },
  {
    kanji: "夢",
    grade: "N4",
    meaning: "꿈",
    onyomi: "ム",
    kunyomi: "ゆめ",
    words: [
      { word: "夢見る", reading: "ゆめみる", meaning: "꿈꾸다" },
      { word: "悪夢", reading: "あくむ", meaning: "악몽" },
      { word: "夢中", reading: "むちゅう", meaning: "열중함/몰두함" }
    ]
  },
  {
    kanji: "夜",
    grade: "N4",
    meaning: "밤",
    onyomi: "ヤ",
    kunyomi: "よる, よ",
    words: [
      { word: "夜中", reading: "よなか", meaning: "한밤중" },
      { word: "今夜", reading: "こんや", meaning: "오늘 밤" },
      { word: "夜食", reading: "やしょく", meaning: "야식" },
      { word: "夜明け", reading: "よあけ", meaning: "새벽녘/동틀 녘" }
    ]
  },
  {
    kanji: "空",
    grade: "N4",
    meaning: "하늘/빌",
    onyomi: "クウ",
    kunyomi: "そら, あ-く, から",
    words: [
      { word: "青空", reading: "あおぞら", meaning: "푸른 하늘" },
      { word: "空港", reading: "くうこう", meaning: "공항" },
      { word: "空気", reading: "くうき", meaning: "공기" },
      { word: "空き缶", reading: "あきかん", meaning: "빈 깡통" }
    ]
  },
  {
    kanji: "花",
    grade: "N4",
    meaning: "꽃",
    onyomi: "カ",
    kunyomi: "はな",
    words: [
      { word: "花見", reading: "はなみ", meaning: "꽃구경" },
      { word: "生け花", reading: "いけばな", meaning: "꽃꽂이" },
      { word: "花屋", reading: "はなや", meaning: "꽃집" },
      { word: "花びら", reading: "はなびら", meaning: "꽃잎" }
    ]
  },
  {
    kanji: "旅",
    grade: "N4",
    meaning: "나그네/여행",
    onyomi: "リョ",
    kunyomi: "たび",
    words: [
      { word: "旅行", reading: "りょこう", meaning: "여행" },
      { word: "一人旅", reading: "ひとりたび", meaning: "나홀로 여행" },
      { word: "旅人", reading: "たびびと", meaning: "여행자/나그네" }
    ]
  },
  {
    kanji: "海",
    grade: "N4",
    meaning: "바다",
    onyomi: "カイ",
    kunyomi: "うみ",
    words: [
      { word: "海外", reading: "かいがい", meaning: "해외" },
      { word: "海水浴", reading: "かいすいよく", meaning: "해수욕" },
      { word: "日本海", reading: "にほんかい", meaning: "동해 (일본명 일본해)" }
    ]
  },
  {
    kanji: "雨",
    grade: "N5",
    meaning: "비",
    onyomi: "ウ",
    kunyomi: "あめ, あま-",
    words: [
      { word: "大雨", reading: "おおあめ", meaning: "폭우/큰비" },
      { word: "雨水", reading: "あまみず", meaning: "빗물" },
      { word: "梅雨", reading: "つゆ", meaning: "장마" }
    ]
  },
  {
    kanji: "風",
    grade: "N4",
    meaning: "바람",
    onyomi: "フウ, フ",
    kunyomi: "かぜ, かざ-",
    words: [
      { word: "台風", reading: "たいふう", meaning: "태풍" },
      { word: "お風呂", reading: "おふろ", meaning: "목욕/욕조" },
      { word: "和風", reading: "わふう", meaning: "일본풍" },
      { word: "風邪", reading: "かぜ", meaning: "감기" }
    ]
  },
  {
    kanji: "音",
    grade: "N4",
    meaning: "소리/음",
    onyomi: "オン, イン",
    kunyomi: "おと, ね",
    words: [
      { word: "音楽", reading: "おんがく", meaning: "음악" },
      { word: "発音", reading: "はつおん", meaning: "발음" },
      { word: "本音", reading: "ほんね", meaning: "속마음/진심" },
      { word: "足音", reading: "あしおと", meaning: "발소리" }
    ]
  },
  {
    kanji: "楽",
    grade: "N4",
    meaning: "즐거울",
    onyomi: "ラク, ガク",
    kunyomi: "たの-しい, たの-しみ",
    words: [
      { word: "楽しい", reading: "たのしい", meaning: "즐겁다" },
      { word: "楽器", reading: "がっき", meaning: "악기" },
      { word: "楽園", reading: "らくえん", meaning: "낙원" },
      { word: "気楽", reading: "きらく", meaning: "편안함" }
    ]
  },
  {
    kanji: "歩",
    grade: "N4",
    meaning: "걸을",
    onyomi: "ホ, ブ",
    kunyomi: "ある-く, あゆ-む",
    words: [
      { word: "歩く", reading: "あるく", meaning: "걷다" },
      { word: "散歩", reading: "さんぽ", meaning: "산책" },
      { word: "一歩", reading: "いっぽ", meaning: "한 걸음" },
      { word: "歩道", reading: "ほどう", meaning: "보도/인도" }
    ]
  },
  {
    kanji: "走",
    grade: "N4",
    meaning: "달릴",
    onyomi: "ソウ",
    kunyomi: "はし-る",
    words: [
      { word: "走る", reading: "はしる", meaning: "달리다" },
      { word: "競走", reading: "きょうそう", meaning: "경주/달리기" },
      { word: "ご馳走", reading: "ごちそう", meaning: "대접/성찬" }
    ]
  },
  {
    kanji: "思",
    grade: "N4",
    meaning: "생각할",
    onyomi: "シ",
    kunyomi: "おも-う",
    words: [
      { word: "思う", reading: "おもう", meaning: "생각하다" },
      { word: "思い出", reading: "おもいで", meaning: "추억" },
      { word: "思い出す", reading: "おもいだす", meaning: "생각해내다" }
    ]
  },
  {
    kanji: "考",
    grade: "N4",
    meaning: "생각할",
    onyomi: "コウ",
    kunyomi: "かんが-える",
    words: [
      { word: "考える", reading: "かんがえる", meaning: "생각하다 (논리적으로)" },
      { word: "考え方", reading: "かんがえかた", meaning: "생각하는 방식" },
      { word: "参考", reading: "さんこう", meaning: "참고" }
    ]
  },
  {
    kanji: "明",
    grade: "N4",
    meaning: "밝을",
    onyomi: "メイ, ミョウ",
    kunyomi: "あか-るい, あ-きらか",
    words: [
      { word: "明るい", reading: "あかるい", meaning: "밝다" },
      { word: "明日", reading: "あした/みょうにち", meaning: "내일" },
      { word: "説明", reading: "せつめい", meaning: "설명" },
      { word: "夜明け", reading: "よあけ", meaning: "새벽녘" }
    ]
  },
  {
    kanji: "暗",
    grade: "N4",
    meaning: "어두울",
    onyomi: "アン",
    kunyomi: "くら-い",
    words: [
      { word: "暗い", reading: "くらい", meaning: "어둡다" },
      { word: "暗記", reading: "あんき", meaning: "암기" },
      { word: "真っ暗", reading: "まっくら", meaning: "칠흑같이 어두움" }
    ]
  },
  {
    kanji: "新",
    grade: "N4",
    meaning: "새로울",
    onyomi: "シン",
    kunyomi: "あたら-しい, あら-た",
    words: [
      { word: "新しい", reading: "あたらしい", meaning: "새롭다" },
      { word: "新聞", reading: "しんぶん", meaning: "신문" },
      { word: "新年", reading: "しんねん", meaning: "새해" }
    ]
  },
  {
    kanji: "古",
    grade: "N5",
    meaning: "옛/낡을",
    onyomi: "コ",
    kunyomi: "ふる-い",
    words: [
      { word: "古い", reading: "ふるい", meaning: "낡다/오래되다" },
      { word: "中古", reading: "ちゅうこ", meaning: "중고" },
      { word: "古代", reading: "こだい", meaning: "고대" }
    ]
  },
  {
    kanji: "多",
    grade: "N4",
    meaning: "많을",
    onyomi: "タ",
    kunyomi: "おお-い",
    words: [
      { word: "多い", reading: "おおい", meaning: "많다" },
      { word: "多分", reading: "たぶん", meaning: "아마도" },
      { word: "多数", reading: "たすう", meaning: "다수" }
    ]
  },
  {
    kanji: "少",
    grade: "N4",
    meaning: "적을",
    onyomi: "ショウ",
    kunyomi: "すく-ない, すこ-し",
    words: [
      { word: "少ない", reading: "すくない", meaning: "적다" },
      { word: "少し", reading: "すこし", meaning: "조금" },
      { word: "少年", reading: "しょうねん", meaning: "소년" }
    ]
  },
  {
    kanji: "長",
    grade: "N4",
    meaning: "길/어른",
    onyomi: "チョウ",
    kunyomi: "なが-い",
    words: [
      { word: "長い", reading: "ながい", meaning: "길다" },
      { word: "校長", reading: "こうちょう", meaning: "교장" },
      { word: "長男", reading: "ちょうなん", meaning: "장남" },
      { word: "身長", reading: "しんちょう", meaning: "신장/키" }
    ]
  },
  {
    kanji: "短",
    grade: "N4",
    meaning: "짧을",
    onyomi: "タン",
    kunyomi: "みじか-い",
    words: [
      { word: "短い", reading: "みじかい", meaning: "짧다" },
      { word: "短所", reading: "たんしょ", meaning: "단점" },
      { word: "短時間", reading: "たんじかん", meaning: "단시간" }
    ]
  },
  {
    kanji: "高",
    grade: "N5",
    meaning: "높을/비쌀",
    onyomi: "コウ",
    kunyomi: "たか-い, たか",
    words: [
      { word: "高い", reading: "たかい", meaning: "높다/비싸다" },
      { word: "高校", reading: "こうこう", meaning: "고등학교" },
      { word: "最高", reading: "さいこう", meaning: "최고" }
    ]
  },
  {
    kanji: "安",
    grade: "N5",
    meaning: "편안할/쌀",
    onyomi: "アン",
    kunyomi: "やす-い",
    words: [
      { word: "安い", reading: "やすい", meaning: "싸다" },
      { word: "安心", reading: "あんしん", meaning: "안심" },
      { word: "安全", reading: "あんぜん", meaning: "안전" }
    ]
  },
  {
    kanji: "世",
    grade: "N4",
    meaning: "대/세상",
    onyomi: "セイ, セ",
    kunyomi: "よ",
    words: [
      { word: "世界", reading: "せかい", meaning: "세계" },
      { word: "世の中", reading: "よのなか", meaning: "세상" },
      { word: "お世話", reading: "おせわ", meaning: "신세/돌봄" }
    ]
  },
  {
    kanji: "界",
    grade: "N4",
    meaning: "경계/계",
    onyomi: "カイ",
    kunyomi: "none",
    words: [
      { word: "世界", reading: "せかい", meaning: "세계" },
      { word: "限界", reading: "げんかい", meaning: "한계" },
      { word: "業界", reading: "ぎょうかい", meaning: "업계" }
    ]
  },
  {
    kanji: "物",
    grade: "N4",
    meaning: "물건",
    onyomi: "ブツ, モツ",
    kunyomi: "もの",
    words: [
      { word: "食べ物", reading: "たべもの", meaning: "음식" },
      { word: "着物", reading: "きもの", meaning: "기모노" },
      { word: "荷物", reading: "にもつ", meaning: "짐" },
      { word: "買い物", reading: "かいもの", meaning: "쇼핑" }
    ]
  },
  {
    kanji: "鳥",
    grade: "N4",
    meaning: "새",
    onyomi: "チョウ",
    kunyomi: "とり",
    words: [
      { word: "鳥", reading: "とり", meaning: "새" },
      { word: "小鳥", reading: "ことり", meaning: "작은 새" },
      { word: "焼き鳥", reading: "やきとり", meaning: "닭꼬치" }
    ]
  },
  {
    kanji: "魚",
    grade: "N4",
    meaning: "물고기",
    onyomi: "ギョ",
    kunyomi: "さかな, うお",
    words: [
      { word: "魚", reading: "さかな", meaning: "물고기" },
      { word: "金魚", reading: "きんぎょ", meaning: "금붕어" },
      { word: "人魚", reading: "にんぎょ", meaning: "인어" }
    ]
  },
  {
    kanji: "紙",
    grade: "N4",
    meaning: "종이",
    onyomi: "シ",
    kunyomi: "かみ",
    words: [
      { word: "手紙", reading: "てがみ", meaning: "편지" },
      { word: "折り紙", reading: "おりがみ", meaning: "종이접기" },
      { word: "和紙", reading: "わし", meaning: "전통 한지 스타일 일본 종이" }
    ]
  },
  {
    kanji: "道",
    grade: "N4",
    meaning: "길",
    onyomi: "ドウ, トウ",
    kunyomi: "みち",
    words: [
      { word: "水道", reading: "すいどう", meaning: "수도" },
      { word: "茶道", reading: "さどう/ちゃどう", meaning: "다도" },
      { word: "車道", reading: "しゃどう", meaning: "차도" },
      { word: "帰り道", reading: "かえりみち", meaning: "귀갓길" }
    ]
  },
  {
    kanji: "天",
    grade: "N5",
    meaning: "하늘",
    onyomi: "テン",
    kunyomi: "あまつ, あめ",
    words: [
      { word: "天気", reading: "てんき", meaning: "날씨" },
      { word: "天才", reading: "てんさい", meaning: "천재" },
      { word: "天国", reading: "てんごく", meaning: "천국" }
    ]
  },
  {
    kanji: "気",
    grade: "N5",
    meaning: "기운",
    onyomi: "キ, ケ",
    kunyomi: "none",
    words: [
      { word: "元気", reading: "げんき", meaning: "건강함/잘 지냄" },
      { word: "気持ち", reading: "きもち", meaning: "기분/마음" },
      { word: "天気", reading: "てんき", meaning: "날씨" },
      { word: "人気", reading: "にんき", meaning: "인기" }
    ]
  },
  {
    kanji: "神",
    grade: "N4",
    meaning: "귀신/신",
    onyomi: "シン, ジン",
    kunyomi: "かみ, かん-, こう-",
    words: [
      { word: "神社", reading: "じんじゃ", meaning: "신사" },
      { word: "神様", reading: "かみさま", meaning: "신령님/하느님" },
      { word: "精神", reading: "せいしん", meaning: "정신" },
      { word: "女神", reading: "めがみ", meaning: "여신" }
    ]
  },
  {
    kanji: "光",
    grade: "N4",
    meaning: "빛",
    onyomi: "コウ",
    kunyomi: "ひか-る, ひかり",
    words: [
      { word: "光る", reading: "ひかる", meaning: "빛나다" },
      { word: "日光", reading: "にっこう", meaning: "햇빛/일광" },
      { word: "観光", reading: "かんこう", meaning: "관광" }
    ]
  },
  {
    kanji: "雪",
    grade: "N4",
    meaning: "눈",
    onyomi: "セツ",
    kunyomi: "ゆき",
    words: [
      { word: "新雪", reading: "しんせつ", meaning: "새로 내린 눈" },
      { word: "雪祭り", reading: "ゆきまつり", meaning: "눈 축제" },
      { word: "大雪", reading: "おおゆき", meaning: "폭설" }
    ]
  },
  {
    kanji: "見",
    grade: "N5",
    meaning: "볼",
    onyomi: "ケン",
    kunyomi: "み-る",
    words: [
      { word: "見る", reading: "みる", meaning: "보다" },
      { word: "夢見る", reading: "ゆめみる", meaning: "꿈꾸다" },
      { word: "月見", reading: "つきみ", meaning: "달맞이" }
    ]
  },
  {
    kanji: "足",
    grade: "N4",
    meaning: "발/충족할",
    onyomi: "ソク",
    kunyomi: "あし, た-る",
    words: [
      { word: "足音", reading: "あしおと", meaning: "발소리" },
      { word: "満足", reading: "まんぞく", meaning: "만족" },
      { word: "足りる", reading: "たりる", meaning: "충분하다" }
    ]
  },
  {
    kanji: "首",
    grade: "N4",
    meaning: "머리/목",
    onyomi: "シュ",
    kunyomi: "くび",
    words: [
      { word: "首", reading: "くび", meaning: "목" },
      { word: "手首", reading: "てくび", meaning: "손목" },
      { word: "首都", reading: "しゅと", meaning: "수도 (한 나라의 머리 도시)" }
    ]
  },
  {
    kanji: "手",
    grade: "N5",
    meaning: "손",
    onyomi: "シュ, ズ",
    kunyomi: "て, -て, た-",
    words: [
      { word: "手紙", reading: "てがみ", meaning: "편지" },
      { word: "歌手", reading: "かしゅ", meaning: "가수" },
      { word: "手首", reading: "てくび", meaning: "손목" },
      { word: "上手", reading: "じょうず", meaning: "잘함/숙련됨" }
    ]
  },
  {
    kanji: "目",
    grade: "N5",
    meaning: "눈",
    onyomi: "モク, ボク",
    kunyomi: "め, -め, ま-",
    words: [
      { word: "目薬", reading: "めぐすり", meaning: "안약" },
      { word: "目的", reading: "もくてき", meaning: "목적" },
      { word: "目立つ", reading: "めだつ", meaning: "눈에 띄다" }
    ]
  }
];

// 한자 문자인지 판별하는 헬퍼 함수
function isKanji(char) {
  // Common CJK Unified Ideographs Unicode Range
  const code = char.charCodeAt(0);
  return (code >= 0x4e00 && code <= 0x9faf);
}

// 텍스트 내에서 고유 한자들을 모두 찾아 배열로 리턴
function extractKanjiFromText(text) {
  const kanjiList = [];
  for (let char of text) {
    if (isKanji(char) && !kanjiList.includes(char)) {
      kanjiList.push(char);
    }
  }
  return kanjiList;
}

// KANJI_DATA 배열을 검색 가능한 맵으로 제공하기 위한 함수
function findKanjiData(kanjiChar) {
  return KANJI_DATA.find(k => k.kanji === kanjiChar) || null;
}
