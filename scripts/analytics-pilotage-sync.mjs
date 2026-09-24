#!/usr/bin/env node
import { queryAllRecords, updateRecord, createRecord } from "../lib/airtable.js";

const TABLES_LOCAL={
  conversionEvents:"tbl7I3YhW09Ztuj2q",
  sales:"tblcwJtw4k7xEmT7n",
  analytics:"tblwILgqyfjPmn0PT",
};

const text=(v)=>String(v??"").trim();
const norm=(v)=>text(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

function parseArgs(argv){
  const out={apply:false,date:""};
  for(const arg of argv){
    if(arg==="--apply") out.apply=true;
    else if(arg.startsWith("--date=")) out.date=arg.slice(7);
    else throw new Error("argument inconnu: "+arg);
  }
  return out;
}
function dayOf(value){
  const ms=Date.parse(text(value));
  if(!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0,10);
}
function isPaidStatus(value){
  const v=norm(value);
  return ["paid","paye","payee","completed","complete","succeeded","success"].includes(v);
}
function isRefunded(value){
  const raw=text(value);
  if(!raw) return false;
  const v=norm(raw);
  if(["false","0","no","non","none","null"].includes(v)) return false;
  return true;
}
export function summarizeAnalytics({events=[],sales=[],date}={}){
  const target=date||new Date().toISOString().slice(0,10);
  const selectedEvents=events.filter(r=>dayOf(r.fields?.["Occurred At"])===target);
  const landingSessions=new Set(
    selectedEvents.filter(r=>text(r.fields?.Event)==="landing").map(r=>text(r.fields?.["Session ID"])).filter(Boolean)
  );
  const checkoutSessions=new Set(
    selectedEvents.filter(r=>text(r.fields?.Event)==="checkout_click").map(r=>text(r.fields?.["Session ID"])).filter(Boolean)
  );
  const paidSales=sales.filter(r=>{
    if(dayOf(r.fields?.Date)!==target) return false;
    if(!isPaidStatus(r.fields?.Statut)) return false;
    if(isRefunded(r.fields?.Remboursement)) return false;
    return true;
  });
  let ca=0, eurComplete=true;
  for(const r of paidSales){
    const currency=text(r.fields?.Devise).toUpperCase();
    const amount=Number(r.fields?.Montant);
    if(currency && currency!=="EUR"){ eurComplete=false; continue; }
    if(Number.isFinite(amount)) ca+=amount;
  }
  return {
    schema:"HIBOU_ANALYTICS_DAILY_V1",
    date:target,
    visits:landingSessions.size,
    checkouts:checkoutSessions.size,
    paid_sales:paidSales.length,
    revenue_eur:Math.round(ca*100)/100,
    revenue_currency_complete:eurComplete,
    costs_known:false,
    data_quality:eurComplete?"Partiel":"Partiel",
    unknown_fields:["Frais Lemon €","Outils payants €","Temps Marc minutes","Corrections manuelles"],
  };
}
function recordFields(summary){
  return {
    "Période":summary.date,
    "Date début":summary.date,
    "Date fin":summary.date,
    "Visites attribuées":summary.visits,
    "Checkouts":summary.checkouts,
    "Ventes réglées":summary.paid_sales,
    "CA €":summary.revenue_eur,
    "Coûts complets":false,
    "Qualité données":summary.data_quality,
    "Notes":"Synchronisé automatiquement depuis Conversion Events + Ventes. Frais, outils, temps humain et corrections restent vides tant qu'ils ne sont pas mesurés.",
  };
}
async function applySummary(summary){
  const rows=await queryAllRecords(TABLES_LOCAL.analytics,{}, {maxRecords:1000});
  const existing=rows.find(r=>text(r.fields?.Période)===summary.date);
  if(existing){
    await updateRecord(TABLES_LOCAL.analytics,existing.id,recordFields(summary));
    return {action:"updated",record_id:existing.id};
  }
  const created=await createRecord(TABLES_LOCAL.analytics,recordFields(summary));
  return {action:"created",record_id:created.records?.[0]?.id||""};
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const [events,sales]=await Promise.all([
    queryAllRecords(TABLES_LOCAL.conversionEvents,{}, {maxRecords:5000}),
    queryAllRecords(TABLES_LOCAL.sales,{}, {maxRecords:5000}),
  ]);
  const summary=summarizeAnalytics({events,sales,date:args.date});
  const out={...summary,dry_run:!args.apply};
  if(args.apply) out.airtable=await applySummary(summary);
  process.stdout.write(JSON.stringify(out,null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
