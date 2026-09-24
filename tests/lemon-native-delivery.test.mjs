import assert from "node:assert/strict";
import test from "node:test";
import { inspectLemonVariantFiles } from "../lib/lemon-native-delivery.mjs";

const jsonResponse=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

test("inspecteur Lemon confirme un PDF sans exposer son URL signée", async () => {
  const result = await inspectLemonVariantFiles({
    apiKey:"test-key",
    variantId:"2140119",
    fetchImpl: async (url, options) => {
      assert.equal(url.origin,"https://api.lemonsqueezy.com");
      assert.equal(url.pathname,"/v1/files");
      assert.equal(url.searchParams.get("filter[variant_id]"),"2140119");
      assert.match(options.headers.Authorization,/^Bearer /);
      return jsonResponse({data:[{id:"42",attributes:{
        variant_id:2140119,identifier:"uuid-1",name:"guide.pdf",extension:"pdf",
        download_url:"https://signed.example/secret",size:1234,size_formatted:"1.2 KB",version:"1.0",sort:1
      }}]});
    }
  });
  assert.equal(result.ready_for_pdf_delivery,true);
  assert.equal(result.pdf_count,1);
  assert.equal(result.files[0].signed_download_url_present,true);
  assert.equal(JSON.stringify(result).includes("signed.example"),false);
  assert.equal(result.side_effects,false);
  assert.equal(result.paid_fallback,false);
});

test("absence de PDF reste fail-closed", async () => {
  const result = await inspectLemonVariantFiles({
    apiKey:"test-key",variantId:"2140119",
    fetchImpl:async()=>jsonResponse({data:[{id:"1",attributes:{name:"notes.txt",extension:"txt"}}]})
  });
  assert.equal(result.ready_for_pdf_delivery,false);
  assert.equal(result.pdf_count,0);
});

test("inspection refuse une erreur API sans fallback", async () => {
  await assert.rejects(
    inspectLemonVariantFiles({apiKey:"x",variantId:"2140119",fetchImpl:async()=>jsonResponse({errors:[{detail:"unauthorized"}]},401)}),
    /401: unauthorized/
  );
});
