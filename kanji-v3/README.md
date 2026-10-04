# 한자 (kanji-v3)

상용한자 2,136자를 **읽기 중심**으로 익히는 폰용 앱. 로그인 없음, 서버 없음 (정적 PWA).
기록은 기기 브라우저에 저장되고, 설정 → 백업 파일로 저장/복원합니다.

## 설계 원칙
- 한자의 읽기 7~8개를 한꺼번에 외우지 않는다 → 읽기를 실제 단어 빈도로 **핵심 / 보조 / 희귀**로 나눠, 핵심만 먼저 보여준다.
- 한자 카드 + 그 한자의 대표 단어 카드(단어 → 읽기)로 복습한다. 읽기는 단어 속에서 익힌다.
- 한국 한자음(받침)으로 음독 어미를 추측하는 힌트를 준다.
- 기능은 오늘 / 쓰기 / 목록 / 설정 네 가지뿐.

## 배포
Kanji Flow v2 서버(`kanji-flow-v2/server.py`)가 8005(기존 앱)와 함께 **8006(이 앱)** 을 같이 띄웁니다.
맥의 launchd 자동배포가 `claude/gallant-albattani-XvrfY` 브랜치를 1분마다 받아 서버를 재시작하므로 별도 설정이 없습니다.
두 앱은 설정 화면에서 서로 링크됩니다.

## 실행 (단독)
```bash
cd kanji-v3/web && python3 -m http.server 8000   # 폰에서 http://<PC 주소>:8000
```
아이폰은 사파리 → 공유 → '홈 화면에 추가'로 설치해야 기록이 유지됩니다.
정적 파일뿐이라 GitHub Pages / Netlify 등 어디에 올려도 동작합니다 (`web/` 폴더가 루트).

## 데이터 다시 만들기
`web/data/kanji.json` 은 `tools/build_data.py` 가 jamdict-data(KANJIDIC2 + JMdict)에서 만들고,
한글 훈음·뜻은 `kanji-flow-v2/anki_cards.json`, `static/kanji_meaning.json` 을 씁니다.
한글 뜻이 없던 단어 868개는 `tools/ko_words.json` 에 번역해 두었습니다. 스크립트 상단 주석 참고.
