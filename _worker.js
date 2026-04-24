addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "00557079826347b81e65bfd787f92cf550b3079c45";
  const B2_BUCKET_NAME = "529665795";
  const B2_FILES_URL_PREFIX = `/file/${B2_BUCKET_NAME}/`;

  try {
    // 1. 授权B2
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });

    if (!authRes.ok) {
      const err = await authRes.text();
      return new Response(`授权失败: ${authRes.status} - ${err}`, { status: 500 });
    }

    const authData = await authRes.json();
    const downloadUrl = authData.downloadUrl;
    const apiUrl = authData.apiUrl;

    // 2. 解析请求路径
    const url = new URL(request.url);
    const path = url.pathname.slice(1);

    // 路径为空时：自动列出桶内所有文件
    if (!path) {
      // 调用B2 API列出文件
      const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bucketId: authData.allowed.bucketId,
          maxFileCount: 100
        })
      });

      if (!listRes.ok) {
        const err = await listRes.text();
        return new Response(`文件列表获取失败: ${listRes.status} - ${err}`, { status: 500 });
      }

      const listData = await listRes.json();
      const files = listData.files || [];

      // 生成HTML文件列表页面
      let html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>B2 文件列表</title>
          <style>
            body { font-family: Arial; max-width: 800px; margin: 20px auto; }
            .file-item { margin: 10px 0; padding: 10px; border: 1px solid #eee; border-radius: 8px; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>B2 桶文件列表</h1>
          <p>点击文件名即可预览：</p>
      `;

      files.forEach(file => {
        const fileUrl = `/${file.fileName}`;
        html += `
          <div class="file-item">
            <a href="${fileUrl}" target="_blank">${file.fileName}</a>
            <span style="color:#666; font-size:12px;">(${Math.round(file.size/1024)} KB)</span>
          </div>
        `;
      });

      html += `
        </body>
      </html>
      `;

      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 路径不为空时：代理文件访问
    const fileUrl = `${downloadUrl}${B2_FILES_URL_PREFIX}${path}`;
    const fileRes = await fetch(fileUrl, {
      headers: { "Authorization": authData.authorizationToken }
    });

    if (!fileRes.ok) {
      const err = await fileRes.text();
      return new Response(`文件拉取失败: ${fileRes.status} - ${err}`, { status: fileRes.status });
    }

    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: headers
    });

  } catch (error) {
    return new Response(`运行错误: ${error.message}`, { status: 500 });
  }
}
