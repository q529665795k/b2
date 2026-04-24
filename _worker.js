export default {
  async fetch(request) {
    const B2_KEY_ID = "005d01d287e45580000000001";
    const B2_APP_KEY = "K00503xO0gW8T+ZL1v3ylTjzNnQEOpl";
    const B2_BUCKET = "529665795";
    const B2_HOST = "s3.us-east-005.backblazeb2.com";

    let token = null, expire = 0;

    async function getAuth() {
      if (token && Date.now() < expire) return token;
      const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { Authorization: "Basic " + btoa(B2_KEY_ID + ":" + B2_APP_KEY) }
      });
      if (!res.ok) throw new Error("Auth failed");
      const json = await res.json();
      token = json.authorizationToken;
      expire = Date.now() + 518400000;
      return token;
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1);
    if (!path) return new Response("请在地址后加文件路径，如 /test.jpg", {status:400});

    try {
      const auth = await getAuth();
      const target = `https://${B2_HOST}/file/${B2_BUCKET}/${path}`;
      const res = await fetch(target, {headers: {Authorization: auth}});
      if (!res.ok) throw new Error("B2 Error:" + res.status);
      return new Response(res.body, {
        headers: {
          "Content-Type": res.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "max-age=86400"
        }
      });
    } catch (e) {
      return new Response("错误: " + e.message.replace("Auth failed", "B2授权失败，请检查密钥"), {status:500});
    }
  }
};
