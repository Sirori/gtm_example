/**
 * 피부 타입 진단 퍼널 (답변에 따라 질문이 갈라지는 분기형)
 *
 * 화면은 URL 해시로 구분한다: #intro → #after_wash → … → #result
 * 질문 해시는 질문 id 라서, 어떤 분기를 거쳤든 같은 질문은 같은 이름으로 집계된다.
 * 브라우저 뒤로가기로도 이전 질문으로 돌아갈 수 있다.
 *
 * 분기 (기본 8문항, 분기에 따라 최대 10문항)
 *   - dry       : Q1 "당기고 건조해요" → 모공 질문 대신 dry_level
 *   - trouble   : trouble 이 "늘 있다/반복된다" → trouble_kind 추가
 *   - sensitive : new_product 가 "따갑다/붉어진다" → sensitive_trigger 추가
 *
 * dataLayer 이벤트 스키마 (GTM 트리거/변수 설정 시 참고)
 *
 * 1) survey_start     - 진단 시작하기 / 다시 진단하기
 *    entry_source     : 유입 경로 (URL 의 ?from= 값, 없으면 "direct")
 *    is_retry         : 이 페이지에서 두 번째 이상 시작했는지
 *
 * 2) survey_view      - 화면이 바뀔 때마다 (퍼널 단계)
 *    survey_step      : "intro" | 질문 id | "result"
 *    step_number      : 0(intro), 1…(질문 순서), 99(result)
 *    total_questions  : 지금까지의 답으로 정해진 전체 질문 수
 *    branch           : "common" | "dry" | "trouble" | "sensitive"
 *
 * 3) survey_answer    - 답을 확정할 때 (단일: 선택 즉시 / 복수: "다음" 클릭)
 *    question_id, question_number, branch
 *    answer_value     : 선택 값. 복수 응답은 고른 순서대로 쉼표로 연결 ("trouble,pore")
 *    answer_label     : 선택 문구. 복수 응답은 ", " 로 연결
 *    answer_count     : 고른 개수 (단일 응답은 1)
 *    is_multi         : 복수 응답 질문인지
 *    answer_changed   : 이미 답한 질문의 답을 바꿨는지
 *
 * 3-1) survey_answer_item - 복수 응답 질문에서 고른 항목마다 1번씩
 *    question_id, answer_value, answer_label
 *    answer_rank      : 몇 번째로 골랐는지 (1 = 가장 먼저)
 *    항목별로 나눠 보내므로 GA4 에서 선택지별 선택 수를 바로 셀 수 있다.
 *
 * 4) survey_branch    - 답 때문에 분기 질문으로 들어갈 때 (시작 1회당 분기별 1번)
 *    branch, trigger_question, trigger_answer
 *
 * 5) survey_back      - 이전 질문으로 돌아갈 때
 *    from_step, to_step
 *    back_method      : "button"(이전 질문 버튼) | "browser"(브라우저 뒤로가기)
 *
 * 6) survey_complete  - 결과 화면에 처음 도달했을 때 (시작 1회당 1번)
 *    skin_type        : "dry" | "oily" | "combo" | "sensitive" | "normal"
 *    skin_type_label, age_group, entry_source
 *    skin_concern     : 고른 고민 전체 ("trouble,pore")
 *    skin_concern_primary : 가장 먼저 고른 고민
 *    concern_count    : 고른 고민 수
 *    survey_branches  : 거친 분기 목록 ("dry,sensitive" / 없으면 "none")
 *    question_count   : 실제로 답한 질문 수
 *    duration_sec     : 시작부터 결과까지 걸린 시간(초)
 *    skin_type 은 dataLayer 에 남으므로, 이후 결과 화면의 cta_click 에서도
 *    GTM 데이터 영역 변수로 함께 읽을 수 있다.
 *
 * 결과 화면의 버튼·상품 카드 클릭은 gtm-tracking.js 의 cta_click 으로 수집된다.
 */
(function () {
  // question id -> 선택한 option index (multi 질문은 고른 순서대로 index 배열)
  var answers = {};

  // 분기 조건용 — 단일 응답 질문에만 쓴다
  function val(id) {
    var q = QUESTION_BY_ID[id];
    return id in answers ? q.options[answers[id]].value : null;
  }

  // when 이 있는 질문은 앞선 답이 조건에 맞을 때만 경로에 들어간다.
  // multi 질문은 max 개까지 복수 선택하고 "다음" 버튼으로 넘어간다.
  // trigger 는 분기를 여는 질문 id, tip 은 분기 질문에서 고른 답에 따라 결과 화면에 보여줄 맞춤 팁.
  var QUESTIONS = [
    {
      id: 'after_wash',
      title: '세안 후 아무것도 바르지 않고\n30분이 지나면 피부가 어떤가요?',
      options: [
        { value: 'tight', label: '얼굴 전체가 당기고 건조해요', score: { dry: 2 } },
        { value: 'comfortable', label: '별다른 느낌 없이 편안해요', score: { normal: 2 } },
        { value: 'tzone_oily', label: 'T존(이마·코)만 살짝 번들거려요', score: { combo: 2 } },
        { value: 'all_oily', label: '얼굴 전체가 번들거려요', score: { oily: 2 } }
      ]
    },
    {
      id: 'afternoon',
      title: '오후 3시쯤 거울을 보면\n피부가 어떤가요?',
      options: [
        { value: 'flaky', label: '각질이 일어나고 화장이 들떠요', score: { dry: 2 } },
        { value: 'same', label: '아침과 크게 다르지 않아요', score: { normal: 2 } },
        { value: 'tzone_shiny', label: '이마와 코 주변만 기름져요', score: { combo: 2 } },
        { value: 'all_shiny', label: '얼굴 전체가 번들거려 기름종이가 필요해요', score: { oily: 2 } }
      ]
    },
    {
      id: 'pore',
      when: function () { return val('after_wash') !== 'tight'; },
      title: '모공은 어떤 편인가요?',
      options: [
        { value: 'invisible', label: '거의 보이지 않아요', score: { dry: 1, normal: 1 } },
        { value: 'nose_only', label: '코 주변만 눈에 띄어요', score: { combo: 2 } },
        { value: 'wide', label: '볼까지 넓게 보여요', score: { oily: 2 } }
      ]
    },
    {
      id: 'dry_level',
      branch: 'dry',
      trigger: 'after_wash',
      when: function () { return val('after_wash') === 'tight'; },
      title: '보습제를 바른 뒤에도\n당기는 느낌이 남아 있나요?',
      options: [
        { value: 'soon_ok', label: '바르면 금방 편안해져요', score: { dry: 1 },
          tip: '보습제로 금방 편안해지는 가벼운 건성이에요. 수분 세럼 하나만 꾸준히 챙겨도 충분해요.' },
        { value: 'hours_later', label: '몇 시간 지나면 다시 당겨요', score: { dry: 2 },
          tip: '오후에 다시 당긴다면 미스트보다 수분 세럼을 한 번 더 덧바르는 게 효과적이에요.' },
        { value: 'still_tight', label: '바르고 나서도 계속 당겨요', score: { dry: 2, sensitive: 1 },
          tip: '발라도 당긴다면 피부 장벽이 약해졌을 수 있어요. 세라마이드 크림으로 장벽부터 채워 주세요.' }
      ]
    },
    {
      id: 'trouble',
      title: '트러블(뾰루지)은\n얼마나 자주 생기나요?',
      options: [
        { value: 'rarely', label: '거의 생기지 않아요', score: { normal: 1, dry: 1 } },
        { value: 'sometimes', label: '피곤하거나 생리 전에 가끔 생겨요', score: { combo: 1 } },
        { value: 'always', label: '늘 한두 개는 있어요', score: { oily: 2 } },
        { value: 'recurring', label: '턱이나 볼에 반복해서 올라와요', score: { oily: 1, sensitive: 1 } }
      ]
    },
    {
      id: 'trouble_kind',
      branch: 'trouble',
      trigger: 'trouble',
      when: function () { var v = val('trouble'); return v === 'always' || v === 'recurring'; },
      title: '트러블은 주로\n어떤 모양인가요?',
      options: [
        { value: 'closed', label: '좁쌀처럼 오돌토돌해요', score: { oily: 1, combo: 1 },
          tip: '좁쌀 트러블은 모공이 막혀서 생겨요. BHA 성분으로 각질과 피지를 부드럽게 녹여 주세요.' },
        { value: 'inflamed', label: '붉게 부어오르고 아파요', score: { oily: 1, sensitive: 1 },
          tip: '붉은 트러블은 짜지 말고, 진정 성분으로 열감부터 가라앉혀 주세요.' },
        { value: 'pus', label: '노랗게 곪아요', score: { oily: 2 },
          tip: '곪는 트러블은 피지가 많을 때 잘 생겨요. 저녁 세안을 꼼꼼히 하고 유분이 적은 제형을 쓰세요.' },
        { value: 'marks', label: '지나간 자국이 오래 남아요', score: {},
          tip: '트러블 자국은 자외선을 받으면 더 진해져요. 자외선 차단제를 꼭 바르고 자국 전용 제품으로 관리하세요.' }
      ]
    },
    {
      id: 'new_product',
      title: '새 화장품을 처음 바르면\n피부가 어떤가요?',
      options: [
        { value: 'fine', label: '대부분 문제없어요', score: { normal: 1 } },
        { value: 'itchy', label: '가끔 따갑거나 가려워요', score: { sensitive: 1 } },
        { value: 'reactive', label: '자주 붉어지거나 트러블이 나요', score: { sensitive: 2 } }
      ]
    },
    {
      id: 'sensitive_trigger',
      branch: 'sensitive',
      trigger: 'new_product',
      when: function () { var v = val('new_product'); return v === 'itchy' || v === 'reactive'; },
      title: '어떤 때에 주로\n피부가 예민해지나요?',
      options: [
        { value: 'fragrance', label: '향이 강한 제품을 쓸 때', score: { sensitive: 1 },
          tip: '향료에 반응한다면 무향·무착색 제품을 고르세요.' },
        { value: 'exfoliant', label: '각질 제거제나 필링을 쓸 때', score: { sensitive: 2 },
          tip: '각질 제거는 주 1회 이하로 줄이고, 산 성분 대신 순한 효소 세안제를 써 보세요.' },
        { value: 'heat', label: '햇빛이 강하거나 더운 곳에 있을 때', score: { sensitive: 1 },
          tip: '열에 붉어진다면 세안 후 시원한 수건으로 열감을 식히고, 자외선 차단제를 꼭 바르세요.' },
        { value: 'friction', label: '마스크를 쓰거나 피부가 쓸릴 때', score: { sensitive: 1 },
          tip: '마찰에 약하다면 세안 후 문지르지 말고 톡톡 두드려 물기를 닦아 주세요.' }
      ]
    },
    {
      id: 'season',
      title: '환절기나 계절이 바뀔 때\n피부가 어떻게 변하나요?',
      options: [
        { value: 'no_change', label: '큰 변화가 없어요', score: { normal: 1 } },
        { value: 'drier', label: '건조함이 심해져요', score: { dry: 2 } },
        { value: 'sensitive', label: '붉어지고 예민해져요', score: { sensitive: 2 } },
        { value: 'oilier', label: '유분이 늘고 트러블이 생겨요', score: { oily: 1, combo: 1 } }
      ]
    },
    {
      id: 'concern',
      multi: true,
      max: 3,
      title: '요즘 신경 쓰이는\n피부 고민을 모두 골라주세요.',
      hint: '최대 3개까지 고를 수 있어요. 가장 먼저 고른 고민에 맞춰 제품을 추천해 드려요.',
      options: [
        { value: 'trouble', label: '트러블·뾰루지', score: { oily: 1 } },
        { value: 'dryness', label: '건조함·당김', score: { dry: 1 } },
        { value: 'pore', label: '넓은 모공·피지', score: { combo: 1 } },
        { value: 'redness', label: '붉은기·예민함', score: { sensitive: 1 } },
        { value: 'scar', label: '트러블 자국', score: {} }
      ]
    },
    {
      id: 'age',
      title: '연령대를 알려주세요.',
      hint: '비슷한 연령대 고객의 선택을 참고해 추천해 드려요.',
      options: [
        { value: '10s', label: '10대', score: {} },
        { value: '20s', label: '20대', score: {} },
        { value: '30s', label: '30대', score: {} },
        { value: '40plus', label: '40대 이상', score: {} }
      ]
    }
  ];

  var QUESTION_BY_ID = {};
  QUESTIONS.forEach(function (q) { QUESTION_BY_ID[q.id] = q; });

  var PRODUCTS = {
    'trouble-131-ampoule': { name: '트러블 131 앰플', price: 38000, img: 'assets/131.jpg' },
    'hyaluronic-intense-serum': { name: '히알루로닉 인텐스 세럼', price: 32000, sale: 25600, img: 'assets/serum_thumb.jpg' },
    'ceramide-capsule-131-cream': { name: '트러블 세라마이드 캡슐 131 크림', price: 42000, sale: 35700, img: 'assets/cream_thumb.jpg' },
    'bio-pore-care-cellulose-mask': { name: '바이오 포어 케어 셀룰로오스 마스크', price: 18000, sale: 16200, img: 'assets/mask_thumb.jpg' },
    'clear-ph-gel-cleanser': { name: '트러블 클리어 약산성 젤 클렌저', price: 22000, sale: 19800, img: 'assets/cleanser_thumb.jpg' },
    'cuscargel': { name: '쿠스카젤 CPX 비타민E 10g', price: 12000, sale: 10800, img: 'assets/patch_thumb.jpg' },
    'triple-retinol-pdrn-toner': { name: '트리플 레티놀 PDRN 토너', price: 26000, sale: 22100, img: 'assets/toner_thumb.jpg' }
  };
  var STORE_URL = 'https://smartstore.naver.com/celladix/products/';

  var TYPES = {
    dry: {
      label: '건성 피부',
      short: '건성',
      summary: '피부 속 수분과 유분이 모두 부족해 쉽게 당기고 각질이 생기는 타입이에요.',
      tips: [
        '세안은 미온수로 짧게, 약산성 클렌저를 사용하세요.',
        '세안 직후 3분 안에 수분 세럼을 발라 주세요.',
        '건조한 날에는 크림을 한 겹 더 발라 수분이 날아가지 않게 막아 주세요.'
      ],
      product: 'hyaluronic-intense-serum'
    },
    oily: {
      label: '지성 피부',
      short: '지성',
      summary: '피지 분비가 많아 얼굴 전체가 번들거리고 모공과 트러블이 생기기 쉬운 타입이에요.',
      tips: [
        '아침·저녁으로 약산성 젤 클렌저로 피지를 부드럽게 씻어내세요.',
        '유분이 적은 가벼운 제형으로 수분을 채워 주세요.',
        'BHA 성분으로 모공 속 피지를 꾸준히 정돈하세요.'
      ],
      product: 'trouble-131-ampoule'
    },
    combo: {
      label: '복합성 피부',
      short: '복합성',
      summary: 'T존은 번들거리고 볼과 턱은 건조한, 부위마다 상태가 다른 타입이에요.',
      tips: [
        'T존은 가볍게, 건조한 볼은 한 겹 더 — 부위별로 나눠 관리하세요.',
        '자극 없는 약산성 클렌저로 피지만 골라 씻어내세요.',
        '주 1~2회 모공 케어 마스크로 T존을 정돈하세요.'
      ],
      product: 'clear-ph-gel-cleanser'
    },
    sensitive: {
      label: '민감성 피부',
      short: '민감성',
      summary: '작은 자극에도 쉽게 붉어지거나 따가운, 피부 장벽이 약해진 타입이에요.',
      tips: [
        '새 제품은 귀 뒤나 팔 안쪽에 먼저 테스트해 보세요.',
        '향료와 알코올이 없는 저자극 제품을 고르세요.',
        '세라마이드로 피부 장벽을 채우는 데 집중하세요.'
      ],
      product: 'ceramide-capsule-131-cream'
    },
    normal: {
      label: '중성 피부',
      short: '중성',
      summary: '유수분 균형이 잘 맞아 편안한 타입이에요. 지금 상태를 지키는 게 핵심이에요.',
      tips: [
        '지금 루틴을 유지하되 계절에 따라 보습 정도를 조절하세요.',
        '자외선 차단제를 매일 발라 피부 노화를 예방하세요.',
        '토너로 피부결을 정돈해 좋은 컨디션을 유지하세요.'
      ],
      product: 'triple-retinol-pdrn-toner'
    }
  };
  // 점수가 같으면 앞에 있는 타입으로 판정
  var TYPE_PRIORITY = ['sensitive', 'combo', 'oily', 'dry', 'normal'];
  // 분석 막대그래프 표시 순서
  var TYPE_DISPLAY = ['dry', 'oily', 'combo', 'sensitive', 'normal'];

  var CONCERN_PRODUCTS = {
    trouble: 'trouble-131-ampoule',
    dryness: 'hyaluronic-intense-serum',
    pore: 'bio-pore-care-cellulose-mask',
    redness: 'ceramide-capsule-131-cream',
    scar: 'cuscargel'
  };

  var RESULT = 99; // 어떤 질문 순서보다 큰 값

  var entrySource = new URLSearchParams(location.search).get('from') || 'direct';
  var currentStep = null;
  var currentName = null;
  var startedAt = null;
  var completed = false;
  var attempts = 0;
  var branchesEntered = {};
  var backMethod = 'browser';
  var advancing = false;
  var draft = null; // 지금 화면의 복수 응답 질문에서 고른 index (확정 전)

  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    intro: document.querySelector('[data-screen="intro"]'),
    question: document.querySelector('[data-screen="question"]'),
    result: document.querySelector('[data-screen="result"]')
  };

  function track(name, params) {
    if (window.trackGTMEvent) window.trackGTMEvent(name, params);
  }

  var toastEl = $('toast');
  var toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2200);
  }

  function won(n) { return n.toLocaleString('ko-KR') + '원'; }

  /* ---------- 경로 · 라우팅 ---------- */

  // 지금까지의 답으로 정해지는 질문 순서. 분기 조건은 항상 앞선 질문의 답만 보므로
  // 현재 질문까지의 순서는 뒤쪽 답이 바뀌어도 변하지 않는다.
  function path() {
    return QUESTIONS.filter(function (q) { return !q.when || q.when(); });
  }

  function stepName(step) {
    if (step === 0) return 'intro';
    var p = path();
    if (step === RESULT || step > p.length) return 'result';
    return p[step - 1].id;
  }

  function stepFromHash() {
    var hash = location.hash.slice(1);
    if (hash === 'result') return RESULT;
    if (hash === '' || hash === 'intro') return 0;
    var p = path();
    for (var i = 0; i < p.length; i++) {
      if (p[i].id === hash) return i + 1;
    }
    // 답을 바꿔 경로에서 빠진 분기 질문 (앞으로가기 등) — render 에서 첫 미응답 질문으로 보낸다
    return RESULT;
  }

  function firstUnanswered() {
    var p = path();
    for (var i = 0; i < p.length; i++) {
      if (!(p[i].id in answers)) return i + 1;
    }
    return RESULT;
  }

  function go(step) {
    location.hash = stepName(step);
  }

  function render() {
    var step = stepFromHash();

    // 새로고침·주소 직접 입력으로 중간 단계에 들어오면 답이 없으므로 처음부터,
    // 답하지 않은 질문을 건너뛰려 하면 풀어야 할 첫 질문으로 돌린다.
    if (startedAt === null) step = 0;
    else if (step > firstUnanswered()) step = firstUnanswered();
    var name = stepName(step);
    if (location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }

    if (currentStep !== null && step < currentStep) {
      track('survey_back', { from_step: currentName, to_step: name, back_method: backMethod });
    }
    backMethod = 'browser';
    currentStep = step;
    currentName = name;

    screens.intro.hidden = step !== 0;
    screens.question.hidden = step === 0 || step === RESULT;
    screens.result.hidden = step !== RESULT;
    window.scrollTo(0, 0);

    var params = { survey_step: name, step_number: step, total_questions: path().length };
    if (step === RESULT) {
      renderResult();
    } else if (step > 0) {
      var q = renderQuestion(step);
      params.branch = q.branch || 'common';
    }

    track('survey_view', params);
  }

  /* ---------- 질문 ---------- */

  function renderQuestion(n) {
    var p = path();
    var q = p[n - 1];

    $('svStepNo').textContent = n;
    $('svStepTotal').textContent = p.length;
    $('svBar').style.width = (n / p.length) * 100 + '%';
    $('svProgress').setAttribute('aria-valuemax', p.length);
    $('svProgress').setAttribute('aria-valuenow', n);
    $('svQNo').textContent = 'Q' + n;
    $('svQTitle').textContent = q.title;
    $('svQHint').textContent = q.hint || '';
    $('svQHint').hidden = !q.hint;
    $('svBack').textContent = n === 1 ? '← 처음으로' : '← 이전 질문';

    // 복수 응답은 "다음"을 누르기 전까지 draft 에만 담아 둔다
    draft = q.multi ? (answers[q.id] || []).slice() : null;

    var options = $('svOptions');
    options.innerHTML = '';
    options.classList.toggle('sv-options--multi', !!q.multi);
    q.options.forEach(function (opt, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sv-option';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        if (q.multi) toggle(q, i);
        else choose(n, i);
      });
      options.appendChild(btn);
    });
    $('svNextWrap').hidden = !q.multi;
    syncOptions(q);

    $('svQTitle').focus({ preventScroll: true });
    return q;
  }

  function syncOptions(q) {
    var selected = q.multi ? draft : [answers[q.id]];
    $('svOptions').querySelectorAll('.sv-option').forEach(function (btn, i) {
      btn.setAttribute('aria-pressed', String(selected.indexOf(i) !== -1));
    });
    if (q.multi) {
      $('svNext').disabled = draft.length === 0;
      $('svNext').querySelector('strong').textContent =
        draft.length ? '다음 · ' + draft.length + '개 선택' : '1개 이상 골라주세요';
    }
  }

  function toggle(q, index) {
    var at = draft.indexOf(index);
    if (at !== -1) {
      draft.splice(at, 1);
    } else if (draft.length >= q.max) {
      toast('최대 ' + q.max + '개까지 고를 수 있어요');
      return;
    } else {
      draft.push(index);
    }
    syncOptions(q);
  }

  $('svNext').addEventListener('click', function () {
    if (!draft || !draft.length) return;
    choose(currentStep, draft.slice());
  });

  // index: 단일 응답은 숫자, 복수 응답은 고른 순서대로 index 배열
  function choose(n, index) {
    if (advancing) return;
    var q = path()[n - 1];
    var picked = [].concat(index).map(function (i) { return q.options[i]; });
    var joined = picked.map(function (o) { return o.value; }).join(',');
    var changed = q.id in answers &&
      [].concat(answers[q.id]).map(function (i) { return q.options[i].value; }).join(',') !== joined;
    answers[q.id] = index;
    syncOptions(q);

    track('survey_answer', {
      question_id: q.id,
      question_number: n,
      answer_value: joined,
      answer_label: picked.map(function (o) { return o.label; }).join(', '),
      answer_count: picked.length,
      is_multi: !!q.multi,
      answer_changed: changed,
      branch: q.branch || 'common'
    });
    if (q.multi) {
      picked.forEach(function (o, rank) {
        track('survey_answer_item', {
          question_id: q.id,
          answer_value: o.value,
          answer_label: o.label,
          answer_rank: rank + 1
        });
      });
    }

    // 이 답 때문에 다음 질문이 분기 질문이 되면 기록
    var next = path()[n];
    if (next && next.branch && !branchesEntered[next.branch]) {
      branchesEntered[next.branch] = true;
      track('survey_branch', { branch: next.branch, trigger_question: next.trigger, trigger_answer: val(next.trigger) });
    }

    // 선택한 답을 잠깐 보여준 뒤 다음 화면으로
    advancing = true;
    setTimeout(function () {
      advancing = false;
      go(n + 1);
    }, 280);
  }

  $('svBack').addEventListener('click', function () {
    backMethod = 'button';
    history.back();
  });

  /* ---------- 결과 ---------- */

  function computeResult() {
    var totals = { dry: 0, oily: 0, combo: 0, sensitive: 0, normal: 0 };
    var picked = {};
    var p = path();
    p.forEach(function (q) {
      var opts = [].concat(answers[q.id]).map(function (i) { return q.options[i]; });
      picked[q.id] = q.multi ? opts : opts[0];
      // 복수 응답은 고른 항목의 점수를 모두 더한다
      opts.forEach(function (opt) {
        Object.keys(opt.score).forEach(function (k) { totals[k] += opt.score[k]; });
      });
    });
    var type = TYPE_PRIORITY.reduce(function (best, k) {
      return totals[k] > totals[best] ? k : best;
    }, TYPE_PRIORITY[0]);
    var branchTips = p.filter(function (q) { return q.branch; })
      .map(function (q) { return picked[q.id].tip; });
    return {
      type: type,
      totals: totals,
      concerns: picked.concern, // 고른 순서대로
      age: picked.age,
      branchTips: branchTips,
      branches: p.filter(function (q) { return q.branch; }).map(function (q) { return q.branch; }),
      questionCount: p.length
    };
  }

  function productCard(id, reason) {
    var p = PRODUCTS[id];
    var a = document.createElement('a');
    a.className = 'goods__item';
    a.href = STORE_URL + id;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('data-gtm-click', 'survey_product_cta');
    a.setAttribute('data-gtm-section', 'survey_result');
    a.setAttribute('data-gtm-label', p.name);
    a.setAttribute('data-gtm-item-id', id);
    a.setAttribute('data-gtm-item-price', p.price);

    var img = document.createElement('img');
    img.className = 'goods__media';
    img.src = p.img;
    img.alt = '';
    img.width = 1068;
    img.height = 1275;

    var why = document.createElement('span');
    why.className = 'goods__reason';
    why.textContent = reason;

    var name = document.createElement('span');
    name.className = 'goods__name';
    name.textContent = p.name;

    var price = document.createElement('span');
    price.className = 'goods__price';
    if (p.sale) {
      var off = Math.round((1 - p.sale / p.price) * 100);
      price.innerHTML = '<em>' + off + '%</em> ' + won(p.sale) + ' <del>' + won(p.price) + '</del>';
    } else {
      price.textContent = won(p.price);
    }

    a.append(img, why, name, price);
    return a;
  }

  function renderResult() {
    var r = computeResult();
    var info = TYPES[r.type];

    $('svType').textContent = info.label;
    $('svSummary').textContent = info.summary;

    var sum = TYPE_DISPLAY.reduce(function (s, k) { return s + r.totals[k]; }, 0) || 1;
    $('svBars').innerHTML = TYPE_DISPLAY.map(function (k) {
      var pct = Math.round((r.totals[k] / sum) * 100);
      return '<li class="' + (k === r.type ? 'is-top' : '') + '">' +
        '<span>' + TYPES[k].short + '</span>' +
        '<span class="sv-bars__track"><span style="width:' + pct + '%"></span></span>' +
        '<span class="sv-bars__pct">' + pct + '%</span></li>';
    }).join('');

    // 분기 질문에서 나온 맞춤 팁을 먼저, 남는 자리는 타입 기본 팁으로 (최대 4개)
    var tips = r.branchTips.map(function (t) { return { text: t, personal: true }; })
      .concat(info.tips.map(function (t) { return { text: t, personal: false }; }))
      .slice(0, 4);
    $('svTips').innerHTML = tips.map(function (t) {
      return t.personal
        ? '<li class="is-personal"><strong class="sv-tips__tag">맞춤</strong>' + t.text + '</li>'
        : '<li>' + t.text + '</li>';
    }).join('');

    var reco = $('svReco');
    reco.innerHTML = '';
    reco.appendChild(productCard(info.product, info.short + ' 피부 맞춤'));
    // 먼저 고른 고민부터 보고, 타입 추천과 겹치지 않는 첫 제품을 한 장 더
    for (var i = 0; i < r.concerns.length; i++) {
      var concernProduct = CONCERN_PRODUCTS[r.concerns[i].value];
      if (concernProduct !== info.product) {
        reco.appendChild(productCard(concernProduct, '고민 맞춤 · ' + r.concerns[i].label));
        break;
      }
    }

    var kit = $('svKit');
    kit.disabled = false;
    kit.querySelector('strong').textContent = '샘플 키트 신청하기';

    if (!completed) {
      completed = true;
      track('survey_complete', {
        skin_type: r.type,
        skin_type_label: info.label,
        skin_concern: r.concerns.map(function (c) { return c.value; }).join(','),
        skin_concern_primary: r.concerns[0].value,
        concern_count: r.concerns.length,
        age_group: r.age.value,
        survey_branches: r.branches.join(',') || 'none',
        question_count: r.questionCount,
        entry_source: entrySource,
        duration_sec: Math.round((Date.now() - startedAt) / 1000)
      });
    }

    $('svType').focus({ preventScroll: true });
  }

  /* ---------- 버튼 ---------- */

  function start() {
    answers = {};
    branchesEntered = {};
    completed = false;
    startedAt = Date.now();
    currentStep = null; // 결과 → 첫 질문 이동을 뒤로가기로 기록하지 않도록
    track('survey_start', { entry_source: entrySource, is_retry: attempts > 0 });
    attempts++;
    go(1);
  }

  $('svStart').addEventListener('click', start);
  $('svRetry').addEventListener('click', start);

  // 샘플 키트 신청 (데모: 실제 신청 API 연동 전까지 토스트만 노출)
  $('svKit').addEventListener('click', function () {
    // 클릭된 요소를 갈아끼우면 cta_click 이 버튼을 못 찾으므로 글자만 바꾼다
    this.disabled = true;
    this.querySelector('strong').textContent = '신청이 완료되었어요';
    toast('샘플 키트 신청이 완료되었어요 🎁');
  });

  $('svShare').addEventListener('click', function () {
    var url = location.origin + location.pathname;
    var data = { title: document.title, text: '나는 ' + TYPES[computeResult().type].label + '! 셀라딕스 1분 피부 타입 진단', url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('링크가 복사되었어요'); });
    }
  });

  window.addEventListener('hashchange', render);
  render();
})();
