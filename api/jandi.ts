

/**
 * 잔디 Webhook 선택 함수
 */
function getJandiWebhook(
  mainCategory: string,
  subCategory: string,
  receiver?: string
): string | null {
  // 1️⃣ 주문서
  if (mainCategory === "ORDER") {
    // 주문서 작성 단계
    if (subCategory === "CREATE") {
      if (receiver === "서울") return process.env.JANDI_WEBHOOK_KR;
      return process.env.JANDI_WEBHOOK_VN; // 대천, 베트남
    }

    // 주문서 결재 완료 단계
    if (subCategory === "APPROVED_SEOUL") return process.env.JANDI_WEBHOOK_KR;
    if (
      subCategory === "APPROVED_DAECHEN" ||
      subCategory === "APPROVED_VIETNAM"
    )
      return process.env.JANDI_WEBHOOK_VN;
  }

  // 2️⃣ 발주서 (사출 / 인쇄 / 메탈 전부 한국)
  if (mainCategory === "PURCHASE") {
    return process.env.JANDI_WEBHOOK_KR;
  }

  // 3️⃣ VN 문서 (VN 주문서, VN 지불요청서)
  if (mainCategory === "VIETNAM") {
    return process.env.JANDI_WEBHOOK_VN;
  }

  return null;
}

export default async function handler(
  req: any,
  res: any
) {
  try {
    const {
      mainCategory,   // ORDER | PURCHASE | VIETNAM
      subCategory,    // enum 값
      receiver,       // 서울 | 대천 | 베트남 (주문서 CREATE일 때만)
      title,          // 문서 제목
      nextInitial,    // 다음 결재자 이니셜
      writerInitial,  // 작성자 이니셜
      status          // request | complete
    } = req.body;

    // 잔디 Webhook 결정
    const webhookUrl = getJandiWebhook(
      mainCategory,
      subCategory,
      receiver
    );

    if (!webhookUrl) {
      return res.status(400).json({ error: "잔디 Webhook 결정 실패" });
    }

    // 메시지 생성
    let message = "";

    if (status === "request") {
      message = `[${title}]
다음 결재자: ${nextInitial}
결재 요청드립니다.`;
    }

    if (status === "complete") {
      message = `[${title}] 결재 완료
작성자(${writerInitial}) 확인 부탁드립니다.`;
    }

    // 잔디로 전송
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: message })
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
