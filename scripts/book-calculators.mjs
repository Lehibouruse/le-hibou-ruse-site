#!/usr/bin/env node
import { readFileSync } from "node:fs";

function finite(name,value,{min=0,max=Infinity}={}){
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max) throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  return n;
}
function money(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
function ratio(name,value){ return finite(name,value,{min:0,max:1}); }

export const CALCULATOR_CATALOG=Object.freeze({
  mother_daughter:{
    source_mechanism:"Régime mère-fille — quote-part",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Estimate the taxable quote-part and associated corporate tax from an eligible dividend. Eligibility is not determined by this calculator."
  },
  ip_box:{
    source_mechanism:"IP Box — taux de 10 %",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Apply the recorded 10% rate to a user-supplied eligible net result. Eligibility/net-result computation is external."
  },
  dutreil_exemption:{
    source_mechanism:"Pacte Dutreil — exonération",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Split a user-supplied eligible value between the recorded 75% exempt fraction and residual fraction before other rules."
  },
  apport_cession_reinvestment:{
    source_mechanism:"Apport-cession — réinvestissement 60 %",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Compute the minimum reinvestment amount from a user-supplied disposal proceeds figure under the recorded 60% condition."
  },
  tax_late_interest:{
    source_mechanism:"Retard fiscal — intérêt de retard",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Simple arithmetic at the recorded 0.20% monthly rate; does not determine whether interest applies or the legally counted months."
  },
  arce:{
    source_mechanism:"ARCE",
    as_of:"2026-09-24",
    revalidate_before_publication:true,
    description:"Apply the recorded 60% capital rate and 3% complementary-pension deduction to user-supplied remaining ARE rights."
  }
});

export function motherDaughter({eligible_dividend,corporate_tax_rate,quote_part_rate=0.05}){
  const dividend=finite("eligible_dividend",eligible_dividend);
  const cit=ratio("corporate_tax_rate",corporate_tax_rate);
  const qp=ratio("quote_part_rate",quote_part_rate);
  const taxable=dividend*qp;
  return {
    calculator:"mother_daughter",
    eligible_dividend:money(dividend),
    quote_part_rate:qp,
    taxable_quote_part:money(taxable),
    corporate_tax_rate:cit,
    estimated_corporate_tax_on_quote_part:money(taxable*cit),
    eligibility_checked:false
  };
}

export function ipBox({eligible_net_result,rate=0.10}){
  const result=finite("eligible_net_result",eligible_net_result);
  const r=ratio("rate",rate);
  return {
    calculator:"ip_box",
    eligible_net_result:money(result),
    rate:r,
    estimated_tax:money(result*r),
    eligibility_checked:false,
    net_result_computation_checked:false
  };
}

export function dutreilExemption({eligible_value,exemption_rate=0.75}){
  const value=finite("eligible_value",eligible_value);
  const rate=ratio("exemption_rate",exemption_rate);
  return {
    calculator:"dutreil_exemption",
    eligible_value:money(value),
    exemption_rate:rate,
    exempt_fraction:money(value*rate),
    residual_fraction_before_other_rules:money(value*(1-rate)),
    eligibility_checked:false
  };
}

export function apportCessionReinvestment({sale_proceeds,reinvestment_rate=0.60}){
  const proceeds=finite("sale_proceeds",sale_proceeds);
  const rate=ratio("reinvestment_rate",reinvestment_rate);
  return {
    calculator:"apport_cession_reinvestment",
    sale_proceeds:money(proceeds),
    reinvestment_rate:rate,
    minimum_reinvestment_amount:money(proceeds*rate),
    timing_and_asset_eligibility_checked:false
  };
}

export function taxLateInterest({principal,months,monthly_rate=0.002}){
  const p=finite("principal",principal);
  const m=finite("months",months,{min:0,max:1200});
  const rate=ratio("monthly_rate",monthly_rate);
  return {
    calculator:"tax_late_interest",
    principal:money(p),
    months:m,
    monthly_rate:rate,
    simple_interest:money(p*m*rate),
    total_before_any_penalties:money(p*(1+m*rate)),
    legal_applicability_checked:false,
    month_count_checked:false
  };
}

export function arce({remaining_are_rights,capital_rate=0.60,pension_deduction_rate=0.03}){
  const rights=finite("remaining_are_rights",remaining_are_rights);
  const rate=ratio("capital_rate",capital_rate);
  const deduction=ratio("pension_deduction_rate",pension_deduction_rate);
  const gross=rights*rate;
  return {
    calculator:"arce",
    remaining_are_rights:money(rights),
    capital_rate:rate,
    gross_capital_before_recorded_deduction:money(gross),
    pension_deduction_rate:deduction,
    recorded_deduction_amount:money(gross*deduction),
    estimated_capital_after_recorded_deduction:money(gross*(1-deduction)),
    eligibility_and_payment_timing_checked:false
  };
}

export function runCalculator(name,input){
  const fn={
    mother_daughter:motherDaughter,
    ip_box:ipBox,
    dutreil_exemption:dutreilExemption,
    apport_cession_reinvestment:apportCessionReinvestment,
    tax_late_interest:taxLateInterest,
    arce
  }[name];
  if(!fn) throw new Error("unknown calculator: "+name);
  return {
    schema:"HIBOU_BOOK_CALCULATION_V1",
    catalog:CALCULATOR_CATALOG[name],
    input,
    output:fn(input),
    warning:"Arithmetic helper only. It does not establish eligibility, legal qualification or publication validity; revalidate the linked official source before publication."
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [name,inputArg]=process.argv.slice(2);
  if(!name||!inputArg) throw new Error("usage: book-calculators.mjs <calculator> '<json>' or <json-file>");
  let input;
  try{ input=JSON.parse(inputArg); }
  catch{
    input=JSON.parse(readFileSync(inputArg,"utf8"));
  }
  process.stdout.write(JSON.stringify(runCalculator(name,input),null,2)+"\n");
}
