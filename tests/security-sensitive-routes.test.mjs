import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(new URL("..",import.meta.url).pathname);
const matrix=JSON.parse(readFileSync(resolve(root,"config/security-sensitive-routes.json"),"utf8"));

test("security matrix covers sensitive route families",()=>{
  assert.equal(matrix.schema,"HIBOU_SENSITIVE_ROUTE_AUTH_MATRIX_V1");
  assert.ok(matrix.routes.length>=20);
  for(const prefix of [
    "app/api/admin/",
    "app/api/book-",
    "app/api/commerce/",
    "app/api/social/",
  ]){
    assert.ok(matrix.routes.some(x=>x.path.startsWith(prefix)),`missing sensitive family: ${prefix}`);
  }
});

for(const entry of matrix.routes){
  test(`sensitive route keeps auth guard: ${entry.path}`,()=>{
    const path=resolve(root,entry.path);
    assert.equal(existsSync(path),true,`missing route ${entry.path}`);
    const source=readFileSync(path,"utf8");
    assert.match(source,/export async function (GET|POST|PUT|PATCH|DELETE)/,`no HTTP handler in ${entry.path}`);
    for(const marker of entry.required_all||[]){
      assert.equal(source.includes(marker),true,`missing security marker "${marker}" in ${entry.path}`);
    }
  });
}

test("cron-only routes use shared constant-time service auth helper",()=>{
  for(const path of ["app/api/orchestrator/route.js","app/api/book-scheduler/route.js"]){
    const source=readFileSync(resolve(root,path),"utf8");
    assert.match(source,/serviceAuthorized\(request\)/);
    assert.match(source,/serviceUnauthorized\(\)/);
    assert.doesNotMatch(source,/request\.headers\.get\("authorization"\)\s*!==\s*`Bearer/);
  }
});
