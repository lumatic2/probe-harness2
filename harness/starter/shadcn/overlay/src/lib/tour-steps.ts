// tour-steps.ts — 화면 안내(온보딩)의 단계 목록. 과제에 맞게 이 목록만 바꾼다: 처음 온 사람(심사위원·실무자)이 「무엇부터 보고 어디서 결정하는지」를 따라가게 5~7단계로.
// target = 짚을 곳의 CSS 선택자. 요소에 data-tour="이름" 을 붙이고 '[data-tour="이름"]' 로 가리키는 것이 가장 안전하다(위젯은 '[data-widget="W2"]' 도 된다).
// page = 그 단계가 다른 화면에 있으면 화면 키(예: 'run') — 안내가 그 화면으로 옮긴 뒤 짚는다. 화면에 없는 target 은 자동으로 건너뛴다.
// 글: title 은 그곳의 이름, text 는 「여기서 무엇을 보고 무엇을 하는가」 한두 문장. 기능 나열이 아니라 일의 순서로 쓴다.
// 도메인 설정(domain.json)에 "tour": [{target,title,text,page?}] 가 있으면 그것이 이 목록을 대신한다. 빈 배열이면 안내를 띄우지 않는다.
import { ctx } from '@/lib/derive'
import type { TourStep } from '@/widgets/tour'

const DEFAULT: TourStep[] = [
  { target: '[data-tour="menu"]', title: '메뉴', text: '위에서 아래로 일의 순서입니다. 현황을 보고, 한 건을 골라, 판정을 남기고, 리포트로 정리합니다.' },
  { target: '[data-tour="filter"]', title: '기간과 범위', text: '여기서 고른 기간과 범위가 이 화면의 모든 숫자에 같이 적용됩니다.' },
  { target: '[data-tour="metrics"]', title: '핵심 지표', text: '지금 상태를 숫자 네 개로 봅니다. 화살표와 「개선·악화」는 직전 기간과 비교한 것입니다.' },
  { target: '[data-widget="W9"]', title: '지금 문제가 되는 것', text: '먼저 봐야 할 건이 위에서부터 나옵니다. 누르면 그 건의 근거로 갑니다.' },
  { target: '[data-tour="queue"]', title: '오늘의 큐', text: '처리할 건의 목록입니다. 행의 ID 를 누르면 상세가 열리고, 거기서 판정을 남깁니다.' },
  { target: '[data-chat-open]', title: 'AI에게 물어보기', text: '화면의 숫자를 보면서 물을 수 있습니다. 패널은 옆에 열려 화면을 가리지 않습니다.' },
]

export const TOUR: TourStep[] = Array.isArray(ctx.d.tour) ? (ctx.d.tour as TourStep[]) : DEFAULT
