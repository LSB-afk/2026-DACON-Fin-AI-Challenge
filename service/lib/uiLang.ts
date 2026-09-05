/**
 * 화면 표시 언어.
 *
 * 이 제품의 사용자는 한국에서 일하는 외국인이다. 캐릭터를 누르기 전에 언어를 고를 수
 * 있어야 첫 문장부터 읽힌다. 목록은 고용허가제(E-9)·방문취업(H-2) 송출국과 인근
 * 다국어 수요를 기준으로 스무 개다 — 번역은 외부 엔진(lib/uiTranslate.ts)이 하므로
 * 여기 언어를 더하는 비용은 줄 하나다.
 *
 * 두 층으로 번역된다:
 *   1. ENTRANCE_TEXT — 입장 화면 문구의 손번역. 엔진이 없어도(오프라인) 첫 화면은 읽힌다.
 *      열 개 언어만 있다. 없는 언어는 한국어로 그려지고 2층이 덮어쓴다.
 *   2. app/_uiTranslator.tsx — 화면의 한국어 텍스트를 통째로 엔진에 보내 바꿔 끼운다.
 *      콘솔 안쪽 화면까지 이 층이 맡는다.
 *
 * 저장은 세션 메모리(sessionStorage)만 — localStorage 금지 원칙은 page.tsx 와 같다.
 */

export const UI_LANGS = [
  { code: "ko", label: "한국어", name: "한국어", en: "Korean", flag: "KR", confirm: "확인" },
  { code: "en", label: "English", name: "영어", en: "English", flag: "US", confirm: "Confirm" },
  { code: "vi", label: "Tiếng Việt", name: "베트남어", en: "Vietnamese", flag: "VN", confirm: "Xác nhận" },
  { code: "zh", label: "中文", name: "중국어(간체)", mt: "zh-CN", en: "Chinese (Simplified)", flag: "CN", confirm: "确认" },
  { code: "th", label: "ไทย", name: "태국어", en: "Thai", flag: "TH", confirm: "ยืนยัน" },
  { code: "id", label: "Bahasa Indonesia", name: "인도네시아어", en: "Indonesian", flag: "ID", confirm: "Konfirmasi" },
  { code: "ne", label: "नेपाली", name: "네팔어", en: "Nepali", flag: "NP", confirm: "पुष्टि गर्नुहोस्" },
  { code: "km", label: "ភាសាខ្មែរ", name: "크메르어", en: "Khmer", flag: "KH", confirm: "បញ្ជាក់" },
  { code: "my", label: "မြန်မာ", name: "미얀마어", en: "Burmese", flag: "MM", confirm: "အတည်ပြုသည်" },
  { code: "uz", label: "Oʻzbekcha", name: "우즈베크어", en: "Uzbek", flag: "UZ", confirm: "Tasdiqlash" },
  { code: "tl", label: "Filipino", name: "필리핀어", en: "Filipino", flag: "PH", confirm: "Kumpirmahin" },
  { code: "mn", label: "Монгол", name: "몽골어", en: "Mongolian", flag: "MN", confirm: "Баталгаажуулах" },
  { code: "bn", label: "বাংলা", name: "벵골어", en: "Bengali", flag: "BD", confirm: "নিশ্চিত করুন" },
  { code: "si", label: "සිංහල", name: "싱할라어", en: "Sinhala", flag: "LK", confirm: "තහවුරු කරන්න" },
  { code: "ur", label: "اردو", name: "우르두어", en: "Urdu", flag: "PK", confirm: "تصدیق کریں" },
  { code: "ky", label: "Кыргызча", name: "키르기스어", en: "Kyrgyz", flag: "KG", confirm: "Ырастоо" },
  { code: "lo", label: "ລາວ", name: "라오어", en: "Lao", flag: "LA", confirm: "ຢືນຢັນ" },
  { code: "tg", label: "Тоҷикӣ", name: "타지크어", en: "Tajik", flag: "TJ", confirm: "Тасдиқ" },
  { code: "ru", label: "Русский", name: "러시아어", en: "Russian", flag: "RU", confirm: "Подтвердить" },
  { code: "ja", label: "日本語", name: "일본어", en: "Japanese", flag: "JP", confirm: "確認" },
] as const;

export type UiLang = (typeof UI_LANGS)[number]["code"];

export function isUiLang(v: string): v is UiLang {
  return UI_LANGS.some((l) => l.code === v);
}

export function uiLangInfo(code: UiLang) {
  return UI_LANGS.find((l) => l.code === code)!;
}

/*
 * confirm — 언어 선택 칸의 [확인] 단추 한 단어 (2026-09-03). 고른 언어로 바로 바뀐다.
 * 손번역(ENTRANCE_TEXT)이 없는 언어도 이 단어만은 있어야 한다 — 못 읽는 단추는 못 누른다.
 */

/** 국기 코드 — app/_flags.tsx 의 FlagCode 와 같은 집합 */
export type UiFlag = (typeof UI_LANGS)[number]["flag"];

/** 외부 번역 엔진에 넘기는 언어 코드 — 대부분 ISO 639-1 그대로, 중국어만 지역 코드 */
export function mtCode(code: UiLang): string {
  const l = uiLangInfo(code);
  return "mt" in l && l.mt ? l.mt : code;
}

/** 입장 화면이 쓰는 문구 전부. 키가 곧 계약이다 — 언어를 더하면 전부 채워야 한다. */
export type EntranceText = {
  /** 워드마크 아래 한 줄 */
  tagline: string;
  /** 언어 선택 칸 제목 */
  chooseLang: string;
  /** 인사 전 — 캐릭터 아래 안내 */
  tapHint: string;
  /** 인사 말풍선 첫 줄 */
  greetTitle: string;
  /** 인사 말풍선 둘째 줄 */
  greetBody: string;
  /** 퀘스트 배지 */
  todo: string;
  /** 퀘스트 카드 하단 실행 문구 */
  runNow: string;
  /** 대시보드 제목 */
  whereTo: string;
  /** 접힌 나머지 화면 — {n} 자리에 개수 */
  more: string;
  /** 하단 — 세션 저장 안내 */
  sessionNote: string;
  /** 입장 씬 건너뛰기 */
  toConsole: string;
  /** 인사 뒤 첫 단추 — 콘솔(홈)로 들어간다 */
  goHome: string;
};

/** 손번역이 있는 언어만. 없는 언어는 entranceText() 가 한국어로 폴백한다 */
export const ENTRANCE_TEXT: Partial<Record<UiLang, EntranceText>> & { ko: EntranceText } = {
  ko: {
    tagline: "급여명세서, 제대로 받고 있나요?",
    chooseLang: "언어",
    tapHint: "페이전트를 눌러 인사를 받아보세요",
    greetTitle: "안녕하세요! 페이전트예요.",
    greetBody: "오른쪽에서 화면을 고르거나, [지금 할 일]을 누르면 제가 대신 실행해 드려요.",
    todo: "지금 할 일",
    runNow: "한 번에 실행 ▶",
    whereTo: "어디로 갈까요?",
    more: "다른 화면 {n}개 보기",
    sessionNote: "진행은 이 세션에만 저장됩니다 — 서버에 아무것도 남기지 않아요",
    toConsole: "바로 콘솔로",
    goHome: "홈 화면으로 이동",
  },
  en: {
    tagline: "Are you being paid correctly?",
    chooseLang: "Language",
    tapHint: "Tap Paygent to say hello",
    greetTitle: "Hi! I'm Paygent.",
    greetBody: "Pick a screen on the right, or press [Next step] and I'll do it for you.",
    todo: "Next step",
    runNow: "Run it for me ▶",
    whereTo: "Where would you like to go?",
    more: "See {n} more screens",
    sessionNote: "Progress is kept only in this session — nothing is stored on a server",
    toConsole: "Skip to console",
    goHome: "Go to home screen",
  },
  vi: {
    tagline: "Bạn có đang nhận đúng lương không?",
    chooseLang: "Ngôn ngữ",
    tapHint: "Chạm vào Paygent để chào hỏi",
    greetTitle: "Xin chào! Mình là Paygent.",
    greetBody: "Chọn một màn hình bên phải, hoặc bấm [Việc cần làm] để mình làm giúp bạn.",
    todo: "Việc cần làm",
    runNow: "Thực hiện ngay ▶",
    whereTo: "Bạn muốn đi đâu?",
    more: "Xem thêm {n} màn hình",
    sessionNote: "Tiến trình chỉ lưu trong phiên này — không lưu gì trên máy chủ",
    toConsole: "Vào thẳng bảng điều khiển",
    goHome: "Đi tới màn hình chính",
  },
  zh: {
    tagline: "你的工资单算对了吗？",
    chooseLang: "语言",
    tapHint: "点一下 Paygent 打个招呼",
    greetTitle: "你好！我是 Paygent。",
    greetBody: "在右侧选择一个页面，或点击[现在要做的事]，我来替你执行。",
    todo: "现在要做的事",
    runNow: "一键执行 ▶",
    whereTo: "想去哪里？",
    more: "查看其他 {n} 个页面",
    sessionNote: "进度仅保存在本次会话中 — 服务器不保存任何内容",
    toConsole: "直接进入控制台",
    goHome: "进入主页面",
  },
  th: {
    tagline: "คุณได้รับค่าจ้างถูกต้องหรือไม่?",
    chooseLang: "ภาษา",
    tapHint: "แตะ Paygent เพื่อทักทาย",
    greetTitle: "สวัสดี! ฉันคือ Paygent",
    greetBody: "เลือกหน้าจอทางขวา หรือกด [สิ่งที่ต้องทำตอนนี้] แล้วฉันจะทำให้",
    todo: "สิ่งที่ต้องทำตอนนี้",
    runNow: "ทำให้เลย ▶",
    whereTo: "อยากไปที่ไหน?",
    more: "ดูหน้าจออื่นอีก {n} หน้า",
    sessionNote: "ความคืบหน้าจะถูกเก็บไว้เฉพาะในเซสชันนี้ — ไม่มีการบันทึกบนเซิร์ฟเวอร์",
    toConsole: "ไปที่คอนโซลเลย",
    goHome: "ไปที่หน้าหลัก",
  },
  id: {
    tagline: "Apakah gaji Anda dibayar dengan benar?",
    chooseLang: "Bahasa",
    tapHint: "Ketuk Paygent untuk menyapa",
    greetTitle: "Halo! Saya Paygent.",
    greetBody: "Pilih layar di sebelah kanan, atau tekan [Langkah berikutnya] dan saya akan menjalankannya untuk Anda.",
    todo: "Langkah berikutnya",
    runNow: "Jalankan sekarang ▶",
    whereTo: "Mau ke mana?",
    more: "Lihat {n} layar lainnya",
    sessionNote: "Kemajuan hanya disimpan di sesi ini — tidak ada yang disimpan di server",
    toConsole: "Langsung ke konsol",
    goHome: "Ke layar utama",
  },
  ne: {
    tagline: "के तपाईंले तलब सही पाइरहनुभएको छ?",
    chooseLang: "भाषा",
    tapHint: "अभिवादनका लागि Paygent थिच्नुहोस्",
    greetTitle: "नमस्ते! म Paygent हुँ।",
    greetBody: "दायाँ स्क्रिन छान्नुहोस्, वा [अहिले गर्ने काम] थिच्नुहोस् — म तपाईंका लागि गरिदिन्छु।",
    todo: "अहिले गर्ने काम",
    runNow: "एकैचोटि चलाउनुहोस् ▶",
    whereTo: "कहाँ जाने?",
    more: "अरू {n} स्क्रिन हेर्नुहोस्",
    sessionNote: "प्रगति यही सत्रमा मात्र रहन्छ — सर्भरमा केही पनि बचत हुँदैन",
    toConsole: "सिधै कन्सोलमा",
    goHome: "गृह स्क्रिनमा जानुहोस्",
  },
  km: {
    tagline: "តើអ្នកទទួលបានប្រាក់ខែត្រឹមត្រូវទេ?",
    chooseLang: "ភាសា",
    tapHint: "ចុច Paygent ដើម្បីស្វាគមន៍",
    greetTitle: "សួស្តី! ខ្ញុំគឺ Paygent។",
    greetBody: "ជ្រើសរើសអេក្រង់នៅខាងស្តាំ ឬចុច [ការងារត្រូវធ្វើឥឡូវ] ហើយខ្ញុំនឹងធ្វើជំនួសអ្នក។",
    todo: "ការងារត្រូវធ្វើឥឡូវ",
    runNow: "ធ្វើឥឡូវនេះ ▶",
    whereTo: "តើអ្នកចង់ទៅណា?",
    more: "មើលអេក្រង់ផ្សេងទៀត {n}",
    sessionNote: "វឌ្ឍនភាពត្រូវបានរក្សាទុកតែក្នុងវគ្គនេះប៉ុណ្ណោះ — គ្មានអ្វីរក្សាទុកនៅលើម៉ាស៊ីនមេទេ",
    toConsole: "ទៅកាន់កុងសូលផ្ទាល់",
    goHome: "ទៅកាន់អេក្រង់ដើម",
  },
  my: {
    tagline: "လစာ မှန်မှန်ကန်ကန် ရနေပါသလား?",
    chooseLang: "ဘာသာစကား",
    tapHint: "နှုတ်ဆက်ရန် Paygent ကို နှိပ်ပါ",
    greetTitle: "မင်္ဂလာပါ! ကျွန်တော် Paygent ပါ။",
    greetBody: "ညာဘက်မှ စာမျက်နှာတစ်ခု ရွေးပါ သို့မဟုတ် [ယခုလုပ်ရန်] ကို နှိပ်ပါ၊ ကျွန်တော် လုပ်ပေးပါမယ်။",
    todo: "ယခုလုပ်ရန်",
    runNow: "ချက်ချင်း လုပ်ပေးမယ် ▶",
    whereTo: "ဘယ်သွားမလဲ?",
    more: "အခြား စာမျက်နှာ {n} ခု ကြည့်ရန်",
    sessionNote: "တိုးတက်မှုကို ဤ session အတွင်းသာ သိမ်းဆည်းသည် — ဆာဗာပေါ်တွင် မည်သည့်အရာမျှ မသိမ်းပါ",
    toConsole: "ကွန်ဆိုးလ်သို့ တိုက်ရိုက်သွားရန်",
    goHome: "ပင်မစာမျက်နှာသို့ သွားရန်",
  },
  uz: {
    tagline: "Maoshingiz to'g'ri to'lanayaptimi?",
    chooseLang: "Til",
    tapHint: "Salomlashish uchun Paygent’ni bosing",
    greetTitle: "Salom! Men Paygent’man.",
    greetBody: "O'ngdan ekranni tanlang yoki [Hozir qilinadigan ish] tugmasini bosing — men siz uchun bajaraman.",
    todo: "Hozir qilinadigan ish",
    runNow: "Darhol bajarish ▶",
    whereTo: "Qayerga boramiz?",
    more: "Yana {n} ta ekranni ko'rish",
    sessionNote: "Jarayon faqat shu seansda saqlanadi — serverda hech narsa saqlanmaydi",
    toConsole: "To'g'ridan-to'g'ri konsolga",
    goHome: "Bosh ekranga o'tish",
  },
};

/** 손번역이 없는 언어는 한국어 — 화면의 자동 번역 층이 곧 덮어쓴다 */
export function entranceText(lang: UiLang): EntranceText {
  return ENTRANCE_TEXT[lang] ?? ENTRANCE_TEXT.ko;
}

/** "{n}" 자리 치환 — 템플릿 엔진 없이 자리 하나만 */
export function fill(template: string, n: number): string {
  return template.replace("{n}", String(n));
}
