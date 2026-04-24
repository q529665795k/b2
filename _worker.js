export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST' && path === '/upload') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
          return Response.json({ code: 400, msg: 'no file' }, { headers: corsHeaders });
        }

        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const key = `uploads/${fileName}`;

        await env.B2_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        const fileUrl = `https://b.im6.qzz.io/${key}`;
        return Response.json(
          { code: 200, data: { url: fileUrl } },
          { headers: corsHeaders }
        );
      } catch (err) {
        return Response.json({ code: 500, msg: 'upload failed' }, { headers: corsHeaders });
      }
    }

    if (request.method === 'GET') {
      const key = path.slice(1);
      if (!key) return new Response('Not Found', { status: 404 });

      const obj = await env.B2_BUCKET.get(key);
      if (!obj) return new Response('Not Found', { status: 404 });

      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata.contentType,
          'Cache-Control': 'public, max-age=31536000',
          ...corsHeaders,
        },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
