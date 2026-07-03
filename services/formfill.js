function splitAddressLine(v) {
  const s = String(v || "").trim();

  if (!s) {
    return {
      addressLine1: "",
      addressLine2: ""
    };
  }

  const parts = s.split(/\s+/);

  return {
    addressLine1: parts[0] || "",
    addressLine2: parts.slice(1).join(" ")
  };
}

function toZenkaku(s) {
  return String(s || "")
    .replace(/-/g, "－")
    .replace(/ /g, "　")
    .replace(/[0-9A-Za-z]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
    );
}

function normalizeProfileData(form) {
  form = form || {};

  const addr = splitAddressLine(form.address2);

  return {
    name: String(form.names || "").trim(),
    kana: String(form.kanas || "").trim(),
    phone: String(form.phones || "").trim(),

    postcode: String(form.postcode || "").trim(),
    pref: String(form.pref || "").trim(),
    city: String(form.address1 || "").trim(),

    addressLine1: toZenkaku(addr.addressLine1),
    addressLine2: toZenkaku(addr.addressLine2),

    birthdate: String(form.birthdate || "").trim()
  };
}

function mergeWithGigya(profile, finalJson) {
  const d = finalJson && finalJson.data ? finalJson.data : {};

  return Object.assign({}, profile, {
    name: profile.name || d.fullName || "",
    kana: profile.kana || d.fullNameKana || "",
    phone: profile.phone || d.phoneNumber || "",

    uid: finalJson.UID || "",
    uidSignature: finalJson.UIDSignature || "",
    signatureTimestamp: finalJson.signatureTimestamp || ""
  });
}

module.exports = {
  splitAddressLine,
  normalizeProfileData,
  mergeWithGigya,
  toZenkaku
};