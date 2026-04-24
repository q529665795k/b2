addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "005d1ab15027fb133ff7b3abcbb3f0962950928081";
  const B2_BUCKET_NAME = "529665795";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 根目录：带完整校验的文件列表
  if (path === "/") {
    try {
      // 第一步：授权验证（先确认密钥是否有效）
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}` }
      });
      if (!authRes.ok) {
        return new Response(JSON.stringify({
          error: "授权失败",
          status: authRes.status,
          statusText: authRes.statusText
        }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const authData = await authRes.json();

      // 第二步：获取文件列表
      const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId: authData.allowed.bucketId, maxFileCount: 2000 })
      });
      if (!listRes.ok) {
        return new Response(JSON.stringify({
          error: "列表请求失败",
          status: listRes.status,
          statusText: listRes.statusText
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const listJson = await listRes.json();

      // 第三步：安全校验数据结构
      if (!listJson || !Array.isArray(listJson.files)) {
        return new Response(JSON.stringify({
          error: "列表数据格式错误",
          rawResponse: listJson
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 第四步：过滤并格式化文件列表
      const fileList = listJson.files
        .filter(item => item.action === "upload")
        .map(item => ({
          name: item.fileName,
          size: item.size,
          url: `https://b.im6.qzz.io/${item.fileName}`
        }));

      return new Response(JSON.stringify(fileList, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "列表获取失败",
        msg: err.message,
        stack: err.stack
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // 2. /upload 上传接口
  if (path === "/upload" && request.method === "POST") {
    try {
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}` }
      });
      if (!authRes.ok) throw new Error("授权失败");
      const authData = await authRes.json();

      const uploadInfo = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId: authData.allowed.bucketId })
      });
      if (!uploadInfo.ok) throw new Error("获取上传地址失败");
      const uploadData = await uploadInfo.json();

      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) throw new Error("无文件");

      const suffix = file.name.split(".").pop();
      const newName = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`;

      const upRes = await fetch(uploadData.uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": uploadData.authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(newName),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });
      if (!upRes.ok) throw new Error("上传失败: " + upRes.status);

      return new Response(JSON.stringify({
        code: 200,
        url: `https://b.im6.qzz.io/${newName}`
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ code: 500, msg: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // 3. 文件访问（图片/视频/下载）
  try {
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: { "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}` }
    });
    if (!authRes.ok) throw new Error("授权失败");
    const authData = await authRes.json();

    const rawPath = path.slice(1);
    const targetUrl = `${authData.downloadUrl}/file/${B2_BUCKET_NAME}/${rawPath}`;

    const fileResp = await fetch(targetUrl, {
      headers: {
        "Authorization": authData.authorizationToken,
        "Range": request.headers.get("range") || ""
      }
    });

    const outHeaders = new Headers(fileResp.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.delete("x-bz-info");

    return new Response(fileResp.body, {
      status: fileResp.status,
      headers: outHeaders
    });
  } catch (err) {
    return new Response("error: " + err.message, { status: 500 });
  }
}
