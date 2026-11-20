const configuredTimeout = Number(process.env.META_GRAPH_TIMEOUT_MS || 10000);
const GRAPH_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.min(15000, Math.max(3000, configuredTimeout))
  : 10000;

function getConfig() {
  const wabaId = String(process.env.META_WABA_ID || "").trim();
  const accessToken = String(process.env.META_ACCESS_TOKEN || "").trim();
  const apiVersion = String(process.env.META_GRAPH_API_VERSION || "v27.0").trim();

  if (!/^\d{5,30}$/.test(wabaId)) {
    throw new Error("META_WABA_ID belum diatur atau formatnya tidak valid.");
  }
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN belum diatur.");
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("META_GRAPH_API_VERSION harus menggunakan format seperti v27.0.");
  }

  return { wabaId, accessToken, apiVersion };
}

function createMetaError(payload, status) {
  const source = payload && payload.error ? payload.error : {};
  const code = Number(source.code || 0);
  const subcode = Number(source.error_subcode || 0);

  if (code === 190) {
    return new Error("Token Meta tidak valid atau sudah kedaluwarsa (OAuth error 190).");
  }
  if (code === 10 || code === 200) {
    return new Error("Token tidak memiliki izin untuk membaca aset WhatsApp Business.");
  }
  if (code === 80008 || status === 429) {
    return new Error("Meta membatasi sementara permintaan API. Coba lagi nanti; tidak dilakukan rotasi IP.");
  }

  const message = String(source.message || "Permintaan Graph API gagal").slice(0, 240);
  const suffix = code ? " (code " + code + (subcode ? "/" + subcode : "") + ")" : "";
  return new Error(message + suffix);
}

async function graphGet(path, params, accessToken, apiVersion) {
  const url = new URL("https://graph.facebook.com/" + apiVersion + "/" + path);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error("Meta mengembalikan respons non-JSON.");
    }

    if (!response.ok || payload.error) {
      throw createMetaError(payload, response.status);
    }
    return payload;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Permintaan ke Meta melewati batas waktu.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getPhoneNumbers(wabaId, accessToken, apiVersion) {
  const fields = [
    "id",
    "display_phone_number",
    "verified_name",
    "quality_rating",
    "code_verification_status",
    "status",
    "name_status",
    "platform_type",
    "throughput"
  ].join(",");

  const phones = [];
  let after = null;
  let hasMore = false;

  for (let page = 0; page < 5; page += 1) {
    const params = { fields, limit: 100 };
    if (after) params.after = after;

    const result = await graphGet(
      wabaId + "/phone_numbers",
      params,
      accessToken,
      apiVersion
    );

    if (!Array.isArray(result.data)) {
      throw new Error("Respons daftar nomor WABA tidak memiliki array data yang valid.");
    }

    phones.push(...result.data);
    const next = result.paging && result.paging.cursors && result.paging.cursors.after;
    hasMore = Boolean(next);
    if (!next || result.data.length === 0) break;
    after = next;
  }

  return { phones, hasMore };
}

async function getWhatsAppBusinessHealth() {
  const { wabaId, accessToken, apiVersion } = getConfig();

  const [account, phoneResult] = await Promise.all([
    graphGet(
      wabaId,
      {
        fields: [
          "id",
          "name",
          "status",
          "business_verification_status",
          "health_status",
          "whatsapp_business_manager_messaging_limit"
        ].join(",")
      },
      accessToken,
      apiVersion
    ),
    getPhoneNumbers(wabaId, accessToken, apiVersion)
  ]);

  return {
    source: "META_GRAPH_API",
    apiVersion,
    checkedAt: new Date().toISOString(),
    account,
    phones: phoneResult.phones,
    phonesTruncated: phoneResult.hasMore
  };
}

module.exports = {
  getWhatsAppBusinessHealth
};
