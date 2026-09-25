import assert from "node:assert/strict";
import test from "node:test";
import {
  apportCessionReinvestment, arce, dutreilExemption, ipBox,
  motherDaughter, runCalculator, taxLateInterest
} from "../scripts/book-calculators.mjs";

test("mother-daughter arithmetic separates eligibility from calculation",()=>{
  const r=motherDaughter({eligible_dividend:100000,corporate_tax_rate:0.25});
  assert.equal(r.taxable_quote_part,5000);
  assert.equal(r.estimated_corporate_tax_on_quote_part,1250);
  assert.equal(r.eligibility_checked,false);
});

test("IP Box arithmetic applies supplied/recorded rate only to eligible net result",()=>{
  const r=ipBox({eligible_net_result:80000});
  assert.equal(r.estimated_tax,8000);
  assert.equal(r.eligibility_checked,false);
});

test("Dutreil arithmetic preserves exempt and residual fractions",()=>{
  const r=dutreilExemption({eligible_value:1000000});
  assert.equal(r.exempt_fraction,750000);
  assert.equal(r.residual_fraction_before_other_rules,250000);
});

test("apport-cession reinvestment amount uses recorded minimum ratio",()=>{
  const r=apportCessionReinvestment({sale_proceeds:500000});
  assert.equal(r.minimum_reinvestment_amount,300000);
  assert.equal(r.timing_and_asset_eligibility_checked,false);
});

test("late interest uses simple monthly arithmetic and no legal inference",()=>{
  const r=taxLateInterest({principal:10000,months:6});
  assert.equal(r.simple_interest,120);
  assert.equal(r.total_before_any_penalties,10120);
  assert.equal(r.legal_applicability_checked,false);
});

test("ARCE helper applies capital percentage then recorded deduction",()=>{
  const r=arce({remaining_are_rights:20000});
  assert.equal(r.gross_capital_before_recorded_deduction,12000);
  assert.equal(r.recorded_deduction_amount,360);
  assert.equal(r.estimated_capital_after_recorded_deduction,11640);
});

test("runCalculator embeds source linkage and publication warning",()=>{
  const r=runCalculator("ip_box",{eligible_net_result:1000});
  assert.equal(r.schema,"HIBOU_BOOK_CALCULATION_V1");
  assert.equal(r.catalog.source_mechanism,"IP Box — taux de 10 %");
  assert.equal(r.catalog.revalidate_before_publication,true);
  assert.match(r.warning,/does not establish eligibility/i);
});

test("rates outside 0..1 are rejected",()=>{
  assert.throws(()=>ipBox({eligible_net_result:100,rate:1.1}),/between 0 and 1/);
});
