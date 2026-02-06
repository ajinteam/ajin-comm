
/**
 * 잔디 Webhook 메시지 전송 서버 핸들러
 * CORS 문제를 방지하기 위해 서버 측에서 Jandi API를 호출합니다.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { target, type, title, recipient } = req.body;

    // 환경 변수에서 웹훅 URL 가져오기
    const webhookUrl = target === 'KR' 
      ? process.env.JANDI_WEBHOOK_KR 
      : process.env.JANDI_WEBHOOK_VN;

    if (!webhookUrl) {
      console.error(`[JANDI API] Webhook URL for ${target} is missing in server environment.`);
      return res.status(400).json({ error: "Webhook configuration missing" });
    }

    // 메시지 구성 (사용자 요청 포맷)
    let message = "";
    if (type === 'REQUEST') {
      message = `[${title}] / 다음 결재자: ${recipient} / 결재 요청드립니다.`;
    } else if (type === 'COMPLETE') {
      message = `[${title}] 결재 완료 / 작성자(${recipient}) 확인 부탁드립니다.`;
    } else if (type === 'REJECT') {
      message = `[${title}] 반송 처리됨 / 작성자(${recipient}) 사유 확인 후 수정 바랍니다.`;
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
