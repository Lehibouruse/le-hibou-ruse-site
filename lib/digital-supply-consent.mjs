export const DIGITAL_SUPPLY_CONSENT_VERSION = "DIGITAL_SUPPLY_V1";

function clean(value) { return String(value ?? "").trim(); }
function trueValue(value) { return value === true || clean(value).toLowerCase() === "true"; }

export function digitalSupplyCustomData({ consentId, consentAt, version = DIGITAL_SUPPLY_CONSENT_VERSION } = {}) {
  const id = clean(consentId);
  const at = clean(consentAt);
  const v = clean(version) || DIGITAL_SUPPLY_CONSENT_VERSION;
  if (!id) throw new Error("consent_id absent");
  if (!Number.isFinite(Date.parse(at))) throw new Error("consent_at invalide");
  return {
    consent_id: id,
    consent_at: at,
    consent_version: v,
    immediate_supply_consent: "true",
    withdrawal_loss_ack: "true",
  };
}

export function validDigitalSupplyCustomData(custom = {}, expectedVersion = DIGITAL_SUPPLY_CONSENT_VERSION) {
  if (!custom || typeof custom !== "object") return false;
  if (!clean(custom.consent_id)) return false;
  if (!Number.isFinite(Date.parse(clean(custom.consent_at)))) return false;
  if (clean(custom.consent_version) !== clean(expectedVersion)) return false;
  return trueValue(custom.immediate_supply_consent) && trueValue(custom.withdrawal_loss_ack);
}

export function digitalSupplyConsentAudit(custom = {}) {
  const values = custom && typeof custom === "object" ? custom : {};
  return [
    clean(values.consent_id) ? `consent_id=${clean(values.consent_id)}` : "",
    clean(values.consent_at) ? `consent_at=${clean(values.consent_at)}` : "",
    clean(values.consent_version) ? `consent_version=${clean(values.consent_version)}` : "",
    `immediate_supply_consent=${trueValue(values.immediate_supply_consent)}`,
    `withdrawal_loss_ack=${trueValue(values.withdrawal_loss_ack)}`,
  ].filter(Boolean);
}
