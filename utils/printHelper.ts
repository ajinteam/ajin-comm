/**
 * Utility for printing HTML content without popup focus/blank-tab issues.
 * Uses a hidden iframe attached to the main window so that Chrome's
 * native "Save As" / "다른 이름으로 저장" dialog receives immediate OS focus
 * without getting stuck on "저장 중..." until another tab is clicked.
 */
export function printHtmlContent(fullHtml: string) {
  // Remove any previous print iframes if present
  const oldFrame = document.getElementById('erp-print-frame');
  if (oldFrame) {
    oldFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'erp-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!frameDoc || !iframe.contentWindow) {
    // Fallback: window.open if iframe is blocked
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(fullHtml);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try {
          win.print();
        } catch (e) {
          console.error(e);
        }
      }, 300);
      win.addEventListener('afterprint', () => win.close());
    }
    return;
  }

  frameDoc.open();
  frameDoc.write(fullHtml);
  frameDoc.close();

  let hasPrinted = false;
  const doPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Error invoking print inside iframe:', e);
    }
  };

  // Listen for afterprint to clean up
  const cleanup = () => {
    setTimeout(() => {
      const el = document.getElementById('erp-print-frame');
      if (el) {
        el.remove();
      }
    }, 1000);
  };

  if (iframe.contentWindow) {
    iframe.contentWindow.addEventListener('afterprint', cleanup);
  }

  // Allow scripts and stylesheets (like Tailwind CDN) in the iframe to execute
  setTimeout(() => {
    doPrint();
  }, 400);
}
