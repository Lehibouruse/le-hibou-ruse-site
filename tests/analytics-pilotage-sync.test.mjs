import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAnalytics } from "../scripts/analytics-pilotage-sync.mjs";

const e=(event,session,at)=>({fields:{Event:event,"Session ID":session,"Occurred At":at}});
const s=(status,amount,date,currency="EUR",refund="FALSE")=>({fields:{Statut:status,Montant:amount,Date:date,Devise:currency,Remboursement:refund}});

test("daily analytics deduplicates sessions and counts only paid non-refunded EUR sales",()=>{
  const out=summarizeAnalytics({
    date:"2026-09-24",
    events:[
      e("landing","a","2026-09-24T08:00:00Z"),
      e("landing","a","2026-09-24T08:05:00Z"),
      e("landing","b","2026-09-24T09:00:00Z"),
      e("checkout_click","a","2026-09-24T10:00:00Z"),
      e("checkout_click","a","2026-09-24T10:01:00Z"),
    ],
    sales:[
      s("paid",29,"2026-09-24T11:00:00Z"),
      s("Configuration en attente",29,"2026-09-24T12:00:00Z"),
      s("paid",29,"2026-09-24T13:00:00Z","EUR","TRUE"),
    ]
  });
  assert.equal(out.visits,2);
  assert.equal(out.checkouts,1);
  assert.equal(out.paid_sales,1);
  assert.equal(out.revenue_eur,29);
  assert.equal(out.costs_known,false);
  assert.ok(out.unknown_fields.includes("Frais Lemon €"));
});

test("non-EUR paid sale is not converted or invented",()=>{
  const out=summarizeAnalytics({date:"2026-09-24",events:[],sales:[s("paid",10,"2026-09-24T11:00:00Z","USD")]});
  assert.equal(out.paid_sales,1);
  assert.equal(out.revenue_eur,0);
  assert.equal(out.revenue_currency_complete,false);
});
