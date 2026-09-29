/**
 * dataLayer 이벤트 스키마 (GTM 트리거/변수 설정 시 참고)
 *
 * 1) 클릭 이벤트 - event: "cta_click"
 *    click_id      : data-gtm-click 값 (버튼/링크 고유 액션 ID)
 *    click_section : data-gtm-section 값 (섹션 ID)
 *    click_label   : data-gtm-label 값 (버튼 텍스트/설명)
 *    click_url     : a 태그인 경우 href
 *    click_type    : "a" | "button"
 *    item_id       : data-gtm-item-id 값 (상품 카드일 때만, 상품 상세 URL의 slug 등)
 *    item_price    : data-gtm-item-price 값 (상품 카드일 때만, 숫자 형태의 원화 금액)
 *
 * 2) 섹션 노출 이벤트 - event: "section_view"
 *    section_name  : data-gtm-section-view 값, 섹션이 50% 이상 보일 때 1회만 발생
 *
 * 3) FAQ 토글 이벤트 - event: "faq_toggle" (main.js 에서 push)
 *    faq_question  : 질문 텍스트
 *    faq_state     : "open" | "close"
 */
(function () {
  window.dataLayer = window.dataLayer || [];

  function trackEvent(eventName, params) {
    window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
  }
  window.trackGTMEvent = trackEvent;

  // 클릭 추적: data-gtm-click 속성이 있는 모든 a/button 위임 처리
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-gtm-click]');
    if (!el) return;

    // href="#"는 아직 실제 목적지가 연결되지 않은 placeholder 링크 — 클릭 추적은 하되
    // 페이지 최상단으로 튀는 기본 동작(#)은 막는다. 실제 URL이 정해지면 href만 바꾸면 됨.
    if (el.tagName === 'A' && el.getAttribute('href') === '#') {
      e.preventDefault();
    }

    var itemId = el.getAttribute('data-gtm-item-id');
    var itemPrice = el.getAttribute('data-gtm-item-price');

    trackEvent('cta_click', {
      click_id: el.getAttribute('data-gtm-click'),
      click_section: el.getAttribute('data-gtm-section') || '',
      click_label: el.getAttribute('data-gtm-label') || el.textContent.trim(),
      click_url: el.tagName === 'A' ? el.href : undefined,
      click_type: el.tagName.toLowerCase(),
      item_id: itemId || undefined,
      item_price: itemPrice ? Number(itemPrice) : undefined
    });
  });

  // 섹션 노출 추적: data-gtm-section-view 속성이 있는 섹션이 50% 이상 보이면 1회 발생
  var seen = new Set();
  var sections = document.querySelectorAll('[data-gtm-section-view]');

  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var name = entry.target.getAttribute('data-gtm-section-view');
        if (entry.isIntersecting && !seen.has(name)) {
          seen.add(name);
          trackEvent('section_view', { section_name: name });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }
})();
