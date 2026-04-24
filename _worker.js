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

  // 1. 根目录：参数拉满的文件列表
  if (path === "/") {
    try {
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
      const listBucketsRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ accountId: authData.accountId })
      });
      const buckets = await listBucketsRes.json();
      const bucket = buckets.buckets.find(b => b.bucketName === B2_BUCKET_NAME);
      if (!bucket) {
        return new Response(JSON.stringify({ error: "桶不存在" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bucketId: bucket.bucketId,
          maxFileCount: 1000,
          prefix: "",
          delimiter: "/",
          startFileName: null
        })
      });
      if (!listRes.ok) {
        return new Response(JSON.stringify({
          error: "列表请求失败",
          status: listRes.status,
          statusText: listRes.statusText,
          rawResponse: await listRes.text()
        }), { status: listRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const listJson = await listRes.json();
      const fileList = listJson.files
        .filter(item => item.action === "upload")
        .map(item => ({
          name: item.fileName,
          size: item.size,
          uploadTimestamp: item.uploadTimestamp,
          url: `https://b.im6.qzz.io/${item.fileName}`
        }));
      return new Response(JSON.stringify({
        success: true,
        bucketName: B2_BUCKET_NAME,
        fileCount: fileList.length,
        files: fileList
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "列表获取失败",
        msg: err.message,
        stack: err.stack
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // ===================== 【纯新增：上传接口】 =====================
  if (path === "/upload" && request.method === "POST") {
    try {
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}` }
      });
      const authData = await authRes.json();
      const listBucketsRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`, {
        method: "POST",
        headers: { Authorization: authData.authorizationToken, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: authData.accountId })
      });
      const buckets = await listBucketsRes.json();
      const bucket = buckets.buckets.find(b => b.bucketName === B2_BUCKET_NAME);
      const uploadInfo = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: { Authorization: authData.authorizationToken, "Content-Type": "application/json" },
        body: JSON.stringify({ bucketId: bucket.bucketId })
      });
      const uploadData = await uploadInfo.json();
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) return new Response(JSON.stringify({ code: 400, msg: "no file" }), { status: 400 });
      const ext = file.name.split(".").pop();
      
      // ===================== ✅ 只改这里：删掉 chat/ =====================
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      // ===================================================================
      
      const upResp = await fetch(uploadData.uploadUrl, {
        method: "POST",
        headers: {
          Authorization: uploadData.authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(filename),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });
      if (!upResp.ok) throw new Error("upload fail");
      return new Response(JSON.stringify({
        code: 200,
        url: "https://b.im6.qzz.io/" + filename
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ code: 500, msg: e.message }), { status: 500, headers: corsHeaders });
    }
  }
  // ===================== 【新增结束】 =====================

  // 3. 文件访问（图片/视频/下载）【纯新增：预览+播放头，不改动原有】
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

    // ===================== 【纯新增：预览&视频播放头】 =====================
    outHeaders.set("Accept-Ranges", "bytes");
    outHeaders.set("Cache-Control", "public, max-age=31536000");
    // ===================== 【新增结束】 =====================

    return new Response(fileResp.body, {
      status: fileResp.status,
      headers: outHeaders
    });
  } catch (err) {
    return new Response("error: " + err.message, { status: 500 });
  }
}
