
/**
 * 잔디 Webhook 메시지 전송 서버 핸들러
 * CORS 문제를 방지하기 위해 서버 측에서 Jandi API를 호출합니다.
 */

// =========================================================================
// [잔디 계정 매핑 설정]
// 앱에서 사용하는 이름 또는 로그인 ID와 '잔디 가입 이메일'을 연결합니다.
// 여기에 등록된 사용자에게는 잔디에서 <@이메일> 형태로 직접 멘션 푸시 알림이 발송됩니다.
// =========================================================================
export const JANDI_USER_MAP: Record<string, string> = {
  // [결재자 등록 예시] - 이름 또는 직책 : 잔디 가입 이메일
  '의순': 'uchoe385@gmail.com',     // 법인장
  '재성': 'ajinprecision@gmail.com',  // 과장
  '무연': 'ajinleader2021@naver.com',    // 이사
  '형춘': 'hyoungchun.shin@ajinpre.net',// 설계/담당
  'DAVID': 'kakyeon.cho@gmail.com',    // 대표
  'KHANH': 'phungthekhanh10011982@gmail.com',// 베트남 구매
  'TU': 'ajin.tutran@gmail.com',    // 베트남 회계
  '순원': 'lswhlh0820@empas.com',// 대천 회계
  '찬호': 'jchbst@naver.com',    // 대천 PRINT
  '상구': 'lsg4429@nate.com',    // 디자인 차장

  // [작성자 / 일반 사용자 로그인 ID 등록 예시]
  // 'AJ5200': 'ajinprecision@gmail.com',
  // 'user1': 'user1@company.com',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { target, type, title, recipient, date } = req.body;

    // 환경 변수에서 웹훅 URL 가져오기
    const webhookUrl = target === 'KR' 
      ? process.env.JANDI_WEBHOOK_KR 
      : target === 'KR_PO'
      ? process.env.JANDI_WEBHOOK_KR_PO
      : process.env.JANDI_WEBHOOK_VN;

    if (!webhookUrl) {
      console.error(`[JANDI API] Webhook URL for ${target} is missing in server environment.`);
      return res.status(400).json({ error: "Webhook configuration missing" });
    }

    // 수신자(recipient) 매핑 이메일 조회 및 잔디 멘션 태그 생성
    const targetEmail = recipient ? (JANDI_USER_MAP[recipient] || (recipient.includes('@') ? recipient : '')) : '';
    const mentionTag = targetEmail ? `<@${targetEmail}> ` : '';

    // 상태별 아이콘 및 메시지 구성
    let prefixIcon = "";
    let message = "";
    
    // 이모지 선택: 요청(🟡), 완료(🟢), 반송(🔴)
    if (type === 'REQUEST') {
      prefixIcon = "🟡";
      message = `${prefixIcon} ${mentionTag}[${date}] [${title}] / 다음 결재자: ${recipient} / 결재 부탁 드립니다.`;
    } else if (type === 'COMPLETE') {
      prefixIcon = "🟢";
      message = `${prefixIcon} ${mentionTag}[${date}] [${title}] 결재 완료 / 작성자(${recipient}) 결재 완료 확인 바랍니다.`;
    } else if (type === 'REJECT') {
      prefixIcon = "🔴";
      message = `${prefixIcon} ${mentionTag}[${date}] [${title}] 반송 처리됨 / 작성자(${recipient}) 사유 확인 후 수정 바랍니다.`;
    }

    // 실제 잔디 API 호출
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/vnd.tosslab.jandi-v2+json"
      },
      body: JSON.stringify({ body: message })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jandi API responded with status ${response.status}: ${errorText}`);
    }

    return res.status(200).json({ success: true, message: "Notification sent successfully" });
  } catch (error: any) {
    console.error("[JANDI SERVER ERROR]", error);
    return res.status(500).json({ error: error.message });
  }
}
