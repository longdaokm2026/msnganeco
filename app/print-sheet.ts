// Quy tắc @page không thể đặt theo điều kiện trong stylesheet, mà named page
// (`page: tên`) chưa được mọi trình duyệt hỗ trợ. Nên khổ giấy được bơm vào
// ngay trước khi in rồi gỡ đi, để mỗi nút in tự quyết định khổ của mình.
export function printWithPage(page: string) {
  const style = document.createElement("style");
  style.media = "print";
  style.textContent = `@page { ${page} }`;
  document.head.append(style);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 60_000);
  window.print();
}
